import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { streamChat } from '@/lib/ai-stream'
import {
  buildSystemPrompt,
  buildDesignPromptPrompt,
  buildDesignPromptAdjustPrompt,
  type TaskType,
} from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'
import { parseDesignOutput } from '@/lib/design-output'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IDEA_CHARS = 10_000
const MAX_ADJUST_CHARS = 10_000
const MAX_CURRENT_PROMPT_CHARS = 50_000
const MAX_CURRENT_BG_CHARS = 50_000

function isValidTaskType(v: unknown): v is TaskType {
  return v === 'CODING' || v === 'AGENT'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function jsonError(message: string, status: number = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()

  try {
    const session = await requireAuth()
    if (!session) {
      return jsonError('未登录', 401)
    }
    const { id } = await params
    if (!isValidCuid(id)) {
      return jsonError('任务 ID 无效', 400)
    }

    const rateLimit = await consumeRateLimit({
      scope: 'ai-design',
      identifier: session.userId,
      limit: 12,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

    let tokenInput: number | null = null
    let tokenOutput: number | null = null
    let taskTitle = ''
    let taskType: TaskType | null = null

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      return jsonError(denied.error, denied.status)
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) {
      return jsonError('任务不存在', 404)
    }
    taskTitle = task.title

    const rawBody = await request.json().catch(() => null)
    if (!isObject(rawBody)) {
      return jsonError('请求内容格式无效', 400)
    }
    const body = rawBody
    const userIdea = typeof body.userIdea === 'string' ? body.userIdea.trim() : ''
    const adjustInstruction = typeof body.adjustInstruction === 'string' ? body.adjustInstruction.trim() : ''
    const currentPrompt = typeof body.currentPrompt === 'string' ? body.currentPrompt : ''
    const currentBackground = typeof body.currentBackground === 'string' ? body.currentBackground : ''

    if (userIdea.length > MAX_IDEA_CHARS) {
      return jsonError(`想法描述过长（最多 ${MAX_IDEA_CHARS} 字）`, 413)
    }
    if (adjustInstruction.length > MAX_ADJUST_CHARS) {
      return jsonError(`调整说明过长（最多 ${MAX_ADJUST_CHARS} 字）`, 413)
    }
    if (currentPrompt.length > MAX_CURRENT_PROMPT_CHARS) {
      return jsonError(`当前 Prompt 过长（最多 ${MAX_CURRENT_PROMPT_CHARS} 字）`, 413)
    }
    if (currentBackground.length > MAX_CURRENT_BG_CHARS) {
      return jsonError(`背景文本过长（最多 ${MAX_CURRENT_BG_CHARS} 字）`, 413)
    }

    // 优先用 body 里的，其次用任务里的
    if (isValidTaskType(body.taskType)) {
      taskType = body.taskType
    } else if (isValidTaskType(task.requirementType)) {
      taskType = task.requirementType as TaskType
    }

    if (!taskType) {
      return jsonError('请先选择任务类型', 400)
    }
    if (!userIdea && !adjustInstruction) {
      return jsonError('请输入您的想法', 400)
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      return jsonError('请先在设置中配置 AI 模型', 400)
    }

    // 保存任务类型到任务里
    if (task.requirementType !== taskType) {
      await prisma.task.update({
        where: { id },
        data: { requirementType: taskType },
      })
    }

    const prompt = adjustInstruction
      ? buildDesignPromptAdjustPrompt({
        taskType,
        currentPrompt,
        currentBackground,
        userInstruction: adjustInstruction,
        userBackground: aiConfig.background,
      })
      : buildDesignPromptPrompt({
        taskType,
        userIdea,
        userBackground: aiConfig.background,
        taskTitle: task.title || undefined,
      })

    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(aiConfig.background) },
      { role: 'user' as const, content: prompt },
    ]

    const encoder = new TextEncoder()
    let fullText = ''
    let streamError: string | null = null

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          send('start', { ts: Date.now(), taskType })

          for await (const chunk of streamChat(messages, {
            baseUrl: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            provider: aiConfig.provider,
            temperature: 0.8,
            maxTokens: aiConfig.maxTokens,
          })) {
            if (chunk.type === 'delta') {
              fullText += chunk.content
              send('delta', { text: chunk.content })
            } else if (chunk.type === 'usage') {
              tokenInput = chunk.usage.promptTokens
              tokenOutput = chunk.usage.completionTokens
            }
          }

          // 解析出两部分
          const parsed = parseDesignOutput(fullText)

          send('done', {
            full: fullText,
            prompt: parsed.prompt,
            background: parsed.background,
            thinking: parsed.thinking,
          })
        } catch (e: unknown) {
          const { message } = safeServerError(e, 'ai-design-prompt')
          streamError = message
          send('error', { message })
        } finally {
          controller.close()
          logAudit(request, {
            action: 'AI_IDEA_GENERATE',
            userId: session.userId,
            taskId: id,
            status: streamError ? 'error' : 'success',
            error: streamError,
            tokenInput,
            tokenOutput,
            durationMs: Date.now() - startedAt,
            detail: { taskTitle, taskType, mode: 'design-prompt', adjust: !!adjustInstruction },
          })
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e: unknown) {
    const { status, message } = safeServerError(e, 'ai-design-prompt-prepare')
    return jsonError(message, status)
  }
}
