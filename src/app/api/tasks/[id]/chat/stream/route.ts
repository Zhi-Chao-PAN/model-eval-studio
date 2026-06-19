import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { streamChat } from '@/lib/ai-stream'
import { buildSystemPrompt } from '@/lib/ai-prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { id } = await params
  const { message, step, modelId } = await request.json()

  if (!message || !step) {
    return new Response(JSON.stringify({ error: 'message 和 step 必填' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: {
      models: { include: { artifacts: true, reports: { take: 1, orderBy: { createdAt: 'desc' } } } },
      attachments: true,
    },
  })
  if (!task) {
    return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先在设置中配置 AI 模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const history = await prisma.taskMessage.findMany({
    where: { taskId: id, step },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  history.reverse()

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

  if (modelId) {
    const m = task.models.find((x) => x.id === modelId)
    if (m) {
      context += `\n\n当前讨论模型：${m.modelCode}`
      if (m.reports?.[0]) context += `，综合评分：${m.reports[0].overallScore}`
    }
  }

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(aiConfig.background) + '\n\n任务上下文：\n' + context },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message },
  ]

  // Persist the user message first so the conversation is saved even if stream is aborted
  const userMsg = await prisma.taskMessage.create({
    data: { taskId: id, role: 'user', content: message, step, modelId },
  })

  const encoder = new TextEncoder()
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('user-message', { message: userMsg })
        send('start', { ts: Date.now() })

        for await (const delta of streamChat(messages, {
          baseUrl: aiConfig.baseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          provider: aiConfig.provider,
          temperature: 0.7,
          maxTokens: 2000,
        })) {
          fullText += delta
          send('delta', { text: delta })
        }

        const assistantMsg = await prisma.taskMessage.create({
          data: { taskId: id, role: 'assistant', content: fullText, step, modelId },
        })

        send('done', { full: fullText, message: assistantMsg })
      } catch (e: any) {
        send('error', { message: e?.message || String(e) })
      } finally {
        controller.close()
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
