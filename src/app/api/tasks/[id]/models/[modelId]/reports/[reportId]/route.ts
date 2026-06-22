import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, safeServerError } from '@/lib/api-error'
import { createReportRevision } from '@/lib/report-versioning'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { validateScores } from '@/lib/score-validation'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { clampDbText, clampRequiredText, DB_TEXT_LIMITS } from '@/lib/utils'

// 获取单条报告详情（含生成依据快照）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; reportId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)
    const { id, modelId, reportId } = await params

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return apiError(denied.error, denied.status)

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true },
    })
    if (!model) return apiError('模型不存在', 404)

    const report = await prisma.modelReport.findFirst({
      where: { id: reportId, taskModelId: modelId },
    })
    if (!report) return apiError('报告不存在', 404)

    let generationSnapshot: unknown = null
    let generationConfig: unknown = null
    try {
      if (report.generationSnapshot) generationSnapshot = JSON.parse(report.generationSnapshot)
      if (report.generationConfig) generationConfig = JSON.parse(report.generationConfig)
    } catch {
      // 解析失败不影响主流程（快照损坏时继续返回其余字段）
    }

    return NextResponse.json({
      report: { ...report, generationSnapshot, generationConfig },
    })
  } catch (err) {
    const { message } = safeServerError(err, 'report-detail')
    return apiError(message, 500)
  }
}

// 基于某版本创建人工修订版
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; reportId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)

    // Rate limit report revisions
    const rl = await consumeRateLimit({
      scope: 'report-revision',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, modelId, reportId } = await params

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) return apiError(denied.error, denied.status)

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true },
    })
    if (!model) return apiError('模型不存在', 404)

    const existingReport = await prisma.modelReport.findFirst({
      where: { id: reportId, taskModelId: modelId },
    })
    if (!existingReport) return apiError('报告不存在', 404)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('请求内容格式无效', 400)
    }

    const {
      productFeedback,
      overallScore,
      overallComment,
      efficiencyScore,
      efficiencyComment,
      qualityScore,
      qualityComment,
      trajectoryAnalysis,
      editNote,
    } = body as Record<string, unknown>

    // 统一评分校验（综合 1-10 整数步长；效率/质量 1-10 步长 0.5）
    const scoreErr = validateScores({ overallScore, efficiencyScore, qualityScore })
    if (scoreErr) return apiError(scoreErr, 400)

    // 类型校验与文本截断
    const asString = (v: unknown): string => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      return String(v)
    }

    // editNote 长度限制（截断到 500 字符以内）
    const safeEditNote =
      typeof editNote === 'string' && editNote.trim() ? editNote.trim().slice(0, 500) : null

    const report = await createReportRevision({
      taskModelId: modelId,
      parentReportId: reportId,
      source: 'MANUAL',
      editedById: session.userId,
      editNote: safeEditNote ?? undefined,
      productFeedback: clampRequiredText(asString(productFeedback), DB_TEXT_LIMITS.COMMENT),
      overallScore: Number(overallScore),
      overallComment: clampRequiredText(asString(overallComment), DB_TEXT_LIMITS.COMMENT),
      efficiencyScore: Number(efficiencyScore),
      efficiencyComment: clampRequiredText(asString(efficiencyComment), DB_TEXT_LIMITS.COMMENT),
      qualityScore: Number(qualityScore),
      qualityComment: clampRequiredText(asString(qualityComment), DB_TEXT_LIMITS.COMMENT),
      trajectoryAnalysis: clampDbText(asString(trajectoryAnalysis) || '未提供轨迹截图。', DB_TEXT_LIMITS.ANALYSIS) ?? '未提供轨迹截图。',
    })

    return NextResponse.json({ report })
  } catch (err) {
    const { message } = safeServerError(err, 'report-revision')
    return apiError('创建修订版失败：' + message, 500)
  }
}
