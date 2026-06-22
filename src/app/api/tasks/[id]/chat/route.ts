import { NextResponse } from 'next/server'
import { TaskStep } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { filterConversationMessages, getWorkflowContent } from '@/lib/task-messages'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  let id = ''
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let tokenInput: number | null = null
  let tokenOutput: number | null = null
  let userMessage = ''

  try {
    const paramsResult = await params
    id = paramsResult.id
    if (!isValidCuid(id)) {
      errorMsg = '任务 ID 无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rateLimit = await consumeRateLimit({
      scope: 'ai-chat',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    const { message: rawMessage, step: rawStep, modelId: rawModelId } = body as { message?: unknown; step?: unknown; modelId?: unknown }
    const message = typeof rawMessage === 'string' ? rawMessage : ''
    const step = typeof rawStep === 'string' ? rawStep : ''
    const modelId = typeof rawModelId === 'string' && rawModelId.trim() ? rawModelId.trim() : null
    userMessage = message

    if (!message.trim()) {
      errorMsg = 'message 不能为空'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (!step) {
      errorMsg = 'step 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (!Object.values(TaskStep).includes(step as TaskStep)) {
      errorMsg = '任务阶段无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (message.length > 100_000) {
      errorMsg = '消息内容过长（最多 10 万字）'
      return NextResponse.json({ error: errorMsg }, { status: 413 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
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
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      errorMsg = '请先配置 AI API'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const history = await prisma.taskMessage.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    })
    const conversationHistory = filterConversationMessages(history.reverse(), task)

    let context = `当前任务：${task.title}
当前步骤：${step}
任务说明：${task.description || '无'}
用户背景：${task.backgroundUsed || aiConfig.background}`

    if (task.models.length > 0) {
      context += `\n\n待测模型：`
      for (const m of task.models) {
        context += `\n- ${m.modelCode}`
        if (m.displayName && m.displayName !== m.modelCode) {
          context += `（${m.displayName}）`
        }
      }
    }

    const analysis = getWorkflowContent(task.analysisJson)
    if (analysis) context += `\n\n已生成的产物分析：\n${analysis.slice(0, 6000)}`

    if (modelId) {
      const m = task.models.find((x) => x.id === modelId)
      if (m) {
        context += `\n\n当前讨论模型：${m.modelCode}`
        if (m.reports?.[0]) {
          context += `，综合评分：${m.reports[0].overallScore}`
        }
      }
    }

    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(task.backgroundUsed || aiConfig.background) + `\n\n任务上下文：\n` + context },
      ...conversationHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ]

    const result = await generateChat(messages as any, {
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      provider: aiConfig.provider,
      temperature: 0.7,
      maxTokens: aiConfig.maxTokens,
    })

    tokenInput = result.usage?.promptTokens ?? null
    tokenOutput = result.usage?.completionTokens ?? null

    const [userMsg, assistantMsg] = await Promise.all([
      prisma.taskMessage.create({
        data: { taskId: id, role: 'user', content: message, step: step as TaskStep, modelId },
      }),
      prisma.taskMessage.create({
        data: { taskId: id, role: 'assistant', content: result.content, step: step as TaskStep, modelId },
      }),
    ])

    status = 'success'
    return NextResponse.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      reply: result.content,
    })
  } catch (e: unknown) {
    const { message } = safeServerError(e, 'ai-chat')
    errorMsg = message
    return NextResponse.json({ error: 'AI 对话失败，请稍后重试' }, { status: 502 })
  } finally {
    logAudit(request, {
      action: 'AI_CHAT',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      tokenInput,
      tokenOutput,
      durationMs: Date.now() - startedAt,
      detail: { preview: userMessage.slice(0, 100) },
    })
  }
}
