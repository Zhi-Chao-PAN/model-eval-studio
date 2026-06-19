import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { filterConversationMessages, getWorkflowContent } from '@/lib/task-messages'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params
  const { message, step, modelId } = await request.json()

  if (!message || !step) {
    return NextResponse.json({ error: 'message 和 step 必填' }, { status: 400 })
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: {
      models: { include: { artifacts: true, reports: { take: 1, orderBy: { createdAt: 'desc' } } } },
      attachments: true,
    },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return NextResponse.json({ error: '请先配置 AI API' }, { status: 400 })
  }

  const history = await prisma.taskMessage.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  const conversationHistory = filterConversationMessages(history.reverse(), task)

  // 构建任务上下文
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

  const taskIdea = getWorkflowContent(task.taskIdeaJson)
  if (taskIdea) context += `\n\n已生成的测试思路：\n${taskIdea.slice(0, 6000)}`

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
    { role: 'system', content: buildSystemPrompt(task.backgroundUsed || aiConfig.background) + `\n\n任务上下文：\n` + context },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  const reply = await generateChat(messages as any, {
    baseUrl: aiConfig.baseUrl,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    provider: aiConfig.provider,
    temperature: 0.7,
    maxTokens: 2000,
  })

  const [userMsg, assistantMsg] = await Promise.all([
    prisma.taskMessage.create({
      data: { taskId: id, role: 'user', content: message, step, modelId },
    }),
    prisma.taskMessage.create({
      data: { taskId: id, role: 'assistant', content: reply, step, modelId },
    }),
  ])

  return NextResponse.json({
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    reply,
  })
}
