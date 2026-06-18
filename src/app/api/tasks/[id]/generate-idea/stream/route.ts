import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { streamChat } from '@/lib/ai-stream'
import { buildSystemPrompt, buildTestIdeaPrompt } from '@/lib/ai-prompts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId },
    include: { attachments: true },
  })
  if (!task) {
    return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先在设置中配置 AI 模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const attachmentsText = task.attachments
    .filter((a) => a.parsedText)
    .map((a) => `文件名：${a.name}\n内容：${a.parsedText}`)
    .join('\n\n')

  const prompt = buildTestIdeaPrompt({
    title: task.title,
    description: task.description || undefined,
    backgroundUsed: task.backgroundUsed || undefined,
    attachmentsText: attachmentsText || undefined,
  })

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(aiConfig.background) },
    { role: 'user' as const, content: prompt },
  ]

  const encoder = new TextEncoder()
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('start', { ts: Date.now() })

        for await (const delta of streamChat(messages, {
          baseUrl: aiConfig.baseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          provider: aiConfig.provider,
          temperature: 0.7,
          maxTokens: 3000,
        })) {
          fullText += delta
          send('delta', { text: delta })
        }

        await prisma.task.update({
          where: { id },
          data: {
            taskIdeaJson: JSON.stringify({ content: fullText, generatedAt: new Date().toISOString() }),
            currentStep: 'IDEA',
            status: 'IN_PROGRESS',
          },
        })
        await prisma.taskMessage.createMany({
          data: [
            { taskId: id, role: 'user', content: '帮我生成测试思路', step: 'IDEA' },
            { taskId: id, role: 'assistant', content: fullText, step: 'IDEA' },
          ],
        })

        send('done', { full: fullText })
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