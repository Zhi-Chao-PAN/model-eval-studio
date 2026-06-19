import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildArtifactAnalysisPrompt } from '@/lib/ai-prompts'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: {
      models: { include: { artifacts: true } },
    },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  if (task.models.length === 0) {
    return NextResponse.json({ error: '还未识别到任何待测模型' }, { status: 400 })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return NextResponse.json({ error: '请先在设置中配置 AI 模型' }, { status: 400 })
  }

  // 保存生成结果
  const modelsData = task.models.map((m) => {
    const metrics = m.hardMetricsJson ? JSON.parse(m.hardMetricsJson) : null
    return {
      modelCode: m.modelCode,
      hardMetricsJson: m.hardMetricsJson,
      processText: m.processText,
      artifacts: m.artifacts.map((a) => ({
        name: a.name,
        parsedText: a.parsedText,
        textContent: a.textContent,
      })),
    }
  })

  const prompt = buildArtifactAnalysisPrompt(task, modelsData)

  let result: string
  try {
    result = await generateChat(
    [
      { role: 'system', content: buildSystemPrompt(aiConfig.background) },
      { role: 'user', content: prompt },
    ],
    {
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      provider: aiConfig.provider as any,
      temperature: 0.6,
      maxTokens: 4000,
    }
  )
  } catch (e: any) {
    return NextResponse.json({ error: 'AI 分析失败：' + (e.message || String(e)) }, { status: 502 })
  }

  await prisma.task.update({
    where: { id },
    data: {
      analysisJson: JSON.stringify({ content: result, generatedAt: new Date().toISOString() }),
      currentStep: 'ARTIFACT',
    },
  })

  return NextResponse.json({ analysis: result })
}
