import { prisma } from '@/lib/prisma'
import { TaskStep } from '@prisma/client'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { streamChat } from '@/lib/ai-stream'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { filterConversationMessages, getWorkflowContent } from '@/lib/task-messages'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      scope: 'ai-chat',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

    // Parse and validate body BEFORE DB access to fail fast on invalid input
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('请求内容格式无效', 400)
    }
    const { message: rawMessage, step: rawStep, modelId: rawModelId } = body as { message?: unknown; step?: unknown; modelId?: unknown }
    const userMessageText = typeof rawMessage === 'string' ? rawMessage : ''
    const step = typeof rawStep === 'string' ? rawStep : ''
    const modelId = typeof rawModelId === 'string' && rawModelId.trim() ? rawModelId.trim() : null

    if (typeof rawMessage !== 'string' || !userMessageText.trim()) {
      return jsonError('message 不能为空', 400)
    }
    if (!step) {
      return jsonError('step 必填', 400)
    }
    if (!Object.values(TaskStep).includes(step as TaskStep)) {
      return jsonError('任务阶段无效', 400)
    }
    if (userMessageText.length > 100_000) {
      return jsonError('消息内容过长（最多 10 万字）', 413)
    }
    const message = userMessageText
    const validatedStep = step as TaskStep

    let tokenInput: number | null = null
    let tokenOutput: number | null = null

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      return jsonError(denied.error, denied.status)
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        backgroundUsed: true,
        analysisJson: true,
        taskIdeaJson: true,
        models: {
          select: {
            id: true,
            modelCode: true,
            displayName: true,
            reports: {
              select: { overallScore: true },
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!task) {
      return jsonError('任务不存在', 404)
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      return jsonError('请先在设置中配置 AI 模型', 400)
    }

    const history = await prisma.taskMessage.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    })
    const conversationHistory = filterConversationMessages(history.reverse(), task)

    let context = `当前任务：${task.title}
当前步骤：${step}
任务 prompt：${task.description || '（未填写）'}
题目来源 / 背景说明：${task.backgroundUsed || '（未填写）'}`

    if (task.models.length > 0) {
      context += `\n\n待测模型：`
      for (const m of task.models) {
        context += `\n- ${m.modelCode}`
        if (m.displayName && m.displayName !== m.modelCode) context += `（${m.displayName}）`
      }
    }

    const analysis = getWorkflowContent(task.analysisJson)
    if (analysis) context += `\n\n已生成的产物分析：\n${analysis.slice(0, 6000)}`

    if (modelId) {
      const m = task.models.find((x) => x.id === modelId)
      if (m) {
        context += `\n\n当前讨论模型：${m.modelCode}`
        if (m.reports?.[0]) context += `，综合评分：${m.reports[0].overallScore}`
      }
    }

    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(aiConfig.background) + '\n\n任务上下文：\n' + context },
      ...conversationHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ]

    // Persist the user message first so the conversation is saved even if stream is aborted
    const userMsg = await prisma.taskMessage.create({
      data: { taskId: id, role: 'user', content: message, step: validatedStep, modelId },
    })

    const encoder = new TextEncoder()
    let fullText = ''
    let streamError: string | null = null

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          send('user-message', { message: userMsg })
          send('start', { ts: Date.now() })

          for await (const chunk of streamChat(messages, {
            baseUrl: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            provider: aiConfig.provider,
            temperature: 0.7,
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

          const assistantMsg = await prisma.taskMessage.create({
            data: { taskId: id, role: 'assistant', content: fullText, step: validatedStep, modelId },
          })

          send('done', { full: fullText, message: assistantMsg })
        } catch (e: unknown) {
          const { message } = safeServerError(e, 'ai-chat-stream')
          streamError = message
          send('error', { message })
        } finally {
          controller.close()
          // Audit log after stream completes
          logAudit(request, {
            action: 'AI_CHAT',
            userId: session.userId,
            taskId: id,
            status: streamError ? 'error' : 'success',
            error: streamError,
            tokenInput,
            tokenOutput,
            durationMs: Date.now() - startedAt,
            detail: { preview: userMessageText.slice(0, 100) },
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
    const { status, message } = safeServerError(e, 'ai-chat-prepare')
    return jsonError(message, status)
  }
}
