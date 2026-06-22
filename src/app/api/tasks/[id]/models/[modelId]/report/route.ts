import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import {
  parseVerificationEvidence,
  serializeVerificationEvidence,
  validateVerificationEvidence,
} from '@/lib/verification-evidence'
import { getNextReportVersion } from '@/lib/report-versioning'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { clampDbText, clampRequiredText, DB_TEXT_LIMITS, isValidCuid } from '@/lib/utils'
import { validateScores } from '@/lib/score-validation'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) {
      return NextResponse.json({ error: '参数格式无效' }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: {
        id: true,
        reports: {
          select: {
            id: true,
            version: true,
            source: true,
            overallScore: true,
            efficiencyScore: true,
            qualityScore: true,
            createdAt: true,
          },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    })
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    return NextResponse.json({ report: model.reports[0] || null })
  } catch (err) {
    const { message } = safeServerError(err, 'report-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    // Rate limit manual report creation
    const rl = await consumeRateLimit({
      scope: 'report-create',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) {
      return NextResponse.json({ error: '参数格式无效' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const {
      productFeedback,
      verificationScreenshotUrls,
      verificationSummary,
      overallScore,
      overallComment,
      efficiencyScore,
      efficiencyComment,
      qualityScore,
      qualityComment,
      trajectoryAnalysis,
    } = body as Record<string, unknown>

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true, taskId: true },
    })
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    // 基本类型校验（文本字段必须是 string，避免 JSON/number 灌入）
    const asString = (v: unknown): string => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      return String(v)
    }
    const pfText = asString(productFeedback)
    const ocText = asString(overallComment)
    const ecText = asString(efficiencyComment)
    const qcText = asString(qualityComment)
    const taText = trajectoryAnalysis == null ? '' : asString(trajectoryAnalysis)
    const vsText = verificationSummary == null ? null : asString(verificationSummary)

    let storedEvidence: string | null = null
    if (verificationScreenshotUrls !== undefined && verificationScreenshotUrls !== null && verificationScreenshotUrls !== '') {
      if (typeof verificationScreenshotUrls !== 'string') {
        return NextResponse.json({ error: '验证截图格式无效' }, { status: 400 })
      }
      const evidence = parseVerificationEvidence(verificationScreenshotUrls)
      const validationError = validateVerificationEvidence(evidence)
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
      storedEvidence = evidence.length ? serializeVerificationEvidence(evidence) : null
    }

    // 统一评分校验（综合 1-10 整数步长；效率/质量 1-10 步长 0.5）
    const scoreErr = validateScores({ overallScore, efficiencyScore, qualityScore }, { required: true })
    if (scoreErr) return NextResponse.json({ error: scoreErr }, { status: 400 })

    const version = await getNextReportVersion(modelId)

    const report = await prisma.modelReport.create({
      data: {
        taskModelId: modelId,
        version,
        source: 'MANUAL',
        editedById: session.userId,
        productFeedback: clampRequiredText(pfText, DB_TEXT_LIMITS.COMMENT),
        verificationScreenshotUrls: storedEvidence,
        verificationSummary: clampDbText(vsText, DB_TEXT_LIMITS.VERIFICATION),
        overallScore: Number(overallScore),
        overallComment: clampRequiredText(ocText, DB_TEXT_LIMITS.COMMENT),
        efficiencyScore: Number(efficiencyScore),
        efficiencyComment: clampRequiredText(ecText, DB_TEXT_LIMITS.COMMENT),
        qualityScore: Number(qualityScore),
        qualityComment: clampRequiredText(qcText, DB_TEXT_LIMITS.COMMENT),
        trajectoryAnalysis: clampDbText(taText || '未提供轨迹截图。', DB_TEXT_LIMITS.ANALYSIS),
      },
    })

    return NextResponse.json({ report })
  } catch (err) {
    const { message } = safeServerError(err, 'report-create')
    return NextResponse.json({ error: '保存报告失败：' + message }, { status: 500 })
  }
}
