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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidTaskType(v: unknown): v is TaskType {
  return v === 'CODING' || v === 'AGENT'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { id } = await params

  let tokenInput: number | null = null
  let tokenOutput: number | null = null
  let taskTitle = ''
  let taskType: TaskType | null = null

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
  })
  if (!task) {
    return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  taskTitle = task.title

  const body = await request.json().catch(() => ({}))
  const userIdea = typeof body.userIdea === 'string' ? body.userIdea.trim() : ''
  const adjustInstruction = typeof body.adjustInstruction === 'string' ? body.adjustInstruction.trim() : ''
  const currentPrompt = typeof body.currentPrompt === 'string' ? body.currentPrompt : ''
  const currentBackground = typeof body.currentBackground === 'string' ? body.currentBackground : ''

  // 优先用 body 里的，其次用任务里的
  if (isValidTaskType(body.taskType)) {
    taskType = body.taskType
  } else if (isValidTaskType(task.requirementType)) {
    taskType = task.requirementType as TaskType
  }

  if (!taskType) {
    return new Response(JSON.stringify({ error: '请先选择任务类型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (!userIdea && !adjustInstruction) {
    return new Response(JSON.stringify({ error: '请输入您的想法' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先在设置中配置 AI 模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
        const { prompt: parsedPrompt, background: parsedBackground } = parseDesignOutput(fullText)

        send('done', {
          full: fullText,
          prompt: parsedPrompt,
          background: parsedBackground,
          thinking: parseDesignOutput(fullText).thinking,
        })
      } catch (e: any) {
        streamError = e?.message || String(e)
        send('error', { message: streamError })
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
}
