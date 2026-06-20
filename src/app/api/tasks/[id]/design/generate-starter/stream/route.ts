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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
  const taskPrompt = typeof body.taskPrompt === 'string' ? body.taskPrompt : task.description || ''
  const taskBackground = typeof body.taskBackground === 'string' ? body.taskBackground : task.backgroundUsed || ''
  const complexity = body.complexity === 'low' || body.complexity === 'high' ? body.complexity : 'medium'

  if (isValidTaskType(body.taskType)) {
    taskType = body.taskType
  } else if (isValidTaskType(task.requirementType)) {
    taskType = task.requirementType as TaskType
  }

  if (!taskType) {
    return new Response(JSON.stringify({ error: '请先选择任务类型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (!taskPrompt.trim()) {
    return new Response(JSON.stringify({ error: '请先生成或填写任务 Prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先在设置中配置 AI 模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
