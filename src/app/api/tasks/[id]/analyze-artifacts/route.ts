import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildArtifactAnalysisPrompt } from '@/lib/ai-prompts'
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
  let taskTitle = ''

  try {
    const paramsResult = await params
    id = paramsResult.id
    if (!isValidCuid(id)) {
      errorMsg = '任务 ID 无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rateLimit = await consumeRateLimit({
      scope: 'ai-artifact-legacy',
      identifier: session.userId,
      limit: 6,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

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
        requirementType: true,
        models: {
          select: {
            id: true,
            modelCode: true,
            hardMetricsJson: true,
            processText: true,
            artifacts: {
              select: { name: true, parsedText: true, textContent: true },
              orderBy: { createdAt: 'asc' },
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
  } catch (e: unknown) {
    const { message } = safeServerError(e, 'ai-artifact-analyze')
    errorMsg = message
    return NextResponse.json({ error: 'AI 分析失败，请稍后重试' }, { status: 502 })
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
