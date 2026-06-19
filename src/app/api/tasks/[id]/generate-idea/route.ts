import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildTestIdeaPrompt } from '@/lib/ai-prompts'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: { attachments: true },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return NextResponse.json({ error: '请先在设置中配置 AI 模型' }, { status: 400 })
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

  const result = await generateChat(
    [
      { role: 'system', content: buildSystemPrompt(aiConfig.background) },
      { role: 'user', content: prompt },
    ],
    {
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      provider: aiConfig.provider as any,
      temperature: 0.7,
      maxTokens: 3000,
    }
  )

  // 保存生成结果
  await prisma.task.update({
    where: { id },
    data: {
      taskIdeaJson: JSON.stringify({ content: result, generatedAt: new Date().toISOString() }),
      currentStep: 'IDEA',
      status: 'IN_PROGRESS',
    },
  })

  // 写入对话消息
  return NextResponse.json({ idea: result })
}
