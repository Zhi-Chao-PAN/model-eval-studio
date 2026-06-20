import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildTestIdeaPrompt } from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let tokenInput: number | null = null
  let tokenOutput: number | null = null
  let taskTitle = ''

  try {
    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
      include: { attachments: true },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    taskTitle = task.title

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      errorMsg = '请先在设置中配置 AI 模型'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
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

    tokenInput = result.usage?.promptTokens ?? null
    tokenOutput = result.usage?.completionTokens ?? null

    // 保存生成结果
    await prisma.task.update({
      where: { id },
      data: {
        taskIdeaJson: JSON.stringify({ content: result.content, generatedAt: new Date().toISOString() }),
        currentStep: 'IDEA',
        status: 'IN_PROGRESS',
      },
    })

    status = 'success'
    return NextResponse.json({ idea: result.content })
  } catch (e: any) {
    errorMsg = e?.message || String(e)
    return NextResponse.json({ error: 'AI 生成失败：' + errorMsg }, { status: 502 })
  } finally {
    logAudit(request, {
      action: 'AI_IDEA_GENERATE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      tokenInput,
      tokenOutput,
      durationMs: Date.now() - startedAt,
      detail: { taskTitle },
    })
  }
}
