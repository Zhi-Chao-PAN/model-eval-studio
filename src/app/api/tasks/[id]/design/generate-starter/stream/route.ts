import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { streamChat } from '@/lib/ai-stream'
import {
  buildSystemPrompt,
  buildStarterCodePrompt,
  type TaskType,
} from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// These are fed into the AI prompt as user-controlled content. Cap them to
// prevent runaway token cost and downstream DB bloat.
const MAX_PROMPT_CHARS = 50_000
const MAX_BACKGROUND_CHARS = 50_000

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
    const taskPrompt = typeof body.taskPrompt === 'string' ? body.taskPrompt : task.description || ''
    const taskBackground = typeof body.taskBackground === 'string' ? body.taskBackground : task.backgroundUsed || ''
    const complexity = body.complexity === 'low' || body.complexity === 'high' ? body.complexity : 'medium'

    if (taskPrompt.length > MAX_PROMPT_CHARS) {
      return jsonError(`任务描述过长（最多 ${MAX_PROMPT_CHARS} 字）`, 413)
    }
    if (taskBackground.length > MAX_BACKGROUND_CHARS) {
      return jsonError(`背景文本过长（最多 ${MAX_BACKGROUND_CHARS} 字）`, 413)
    }

    if (isValidTaskType(body.taskType)) {
      taskType = body.taskType
    } else if (isValidTaskType(task.requirementType)) {
      taskType = task.requirementType as TaskType
    }

    if (!taskType) {
      return jsonError('请先选择任务类型', 400)
    }
    if (!taskPrompt.trim()) {
      return jsonError('请先生成或填写任务 Prompt', 400)
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      return jsonError('请先在设置中配置 AI 模型', 400)
    }

    const prompt = buildStarterCodePrompt({
      taskType,
      taskPrompt,
      taskBackground,
      userBackground: aiConfig.background,
      complexity,
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
          send('start', { ts: Date.now(), taskType, complexity })

          for await (const chunk of streamChat(messages, {
            baseUrl: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            provider: aiConfig.provider,
            temperature: 0.7,
            maxTokens: Math.floor((aiConfig.maxTokens ?? 4000) * 2.5),
          })) {
            if (chunk.type === 'delta') {
              fullText += chunk.content
              send('delta', { text: chunk.content })
            } else if (chunk.type === 'usage') {
              tokenInput = chunk.usage.promptTokens
              tokenOutput = chunk.usage.completionTokens
            }
          }

          // 解析 JSON
          const parsed = extractStarterCodeJson(fullText)
          if (!parsed) {
            throw new Error('AI 输出的起始代码格式不正确，未能解析为 JSON')
          }

          send('done', {
            full: fullText,
            starter: parsed,
          })
        } catch (e: unknown) {
          const { message } = safeServerError(e, 'ai-design-starter')
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
            detail: { taskTitle, taskType, mode: 'design-starter', complexity },
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
    const { status, message } = safeServerError(e, 'ai-design-starter-prepare')
    return jsonError(message, status)
  }
}

type StarterFile = { path: string; content: string }
type StarterCode = {
  projectName: string
  files: StarterFile[]
  readme: string
}

function extractStarterCodeJson(text: string): StarterCode | null {
  // 1. 先尝试找 ```json 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // 继续尝试
    }
  }

  // 2. 尝试找最外层的 { ... }
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          // 继续找下一个
        }
        start = -1
      }
    }
  }

  return null
}
