import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildArtifactAnalysisPrompt } from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const rateLimit = await consumeRateLimit({
    scope: 'ai-artifact-legacy',
    identifier: session.userId,
    limit: 6,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let tokenInput: number | null = null
  let tokenOutput: number | null = null
  let taskTitle = ''

  try {
    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
      include: {
        models: { include: { artifacts: true } },
      },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    taskTitle = task.title

    if (task.models.length === 0) {
      errorMsg = '还未识别到任何待测模型'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      errorMsg = '请先在设置中配置 AI 模型'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

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
        temperature: 0.6,
        maxTokens: aiConfig.maxTokens,
      }
    )

    tokenInput = result.usage?.promptTokens ?? null
    tokenOutput = result.usage?.completionTokens ?? null

    await prisma.task.update({
      where: { id },
      data: {
        analysisJson: JSON.stringify({ content: result.content, generatedAt: new Date().toISOString() }),
        currentStep: 'ARTIFACT',
      },
    })

    status = 'success'
    return NextResponse.json({ analysis: result.content })
  } catch (e: any) {
    errorMsg = e?.message || String(e)
    return NextResponse.json({ error: 'AI 分析失败：' + errorMsg }, { status: 502 })
  } finally {
    logAudit(request, {
      action: 'AI_ARTIFACT_ANALYZE',
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
