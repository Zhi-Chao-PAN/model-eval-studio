import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { createReportRevision } from '@/lib/report-versioning'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { validateScores } from '@/lib/score-validation'

// 获取单条报告详情（含生成依据快照）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; reportId: string }> },
) {
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
}

// 基于某版本创建人工修订版
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; reportId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
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

  try {
    const body = await request.json()
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
    } = body

    // 统一评分校验（综合 1-10 整数步长；效率/质量 1-10 步长 0.5）
    const scoreErr = validateScores({ overallScore, efficiencyScore, qualityScore })
    if (scoreErr) return apiError(scoreErr, 400)

    // editNote 长度限制（截断到 500 字符以内）
    const safeEditNote =
      typeof editNote === 'string' && editNote.trim() ? editNote.trim().slice(0, 500) : null

    const report = await createReportRevision({
      taskModelId: modelId,
      parentReportId: reportId,
      source: 'MANUAL',
      editedById: session.userId,
      editNote: safeEditNote ?? undefined,
      productFeedback,
      overallScore,
      overallComment,
      efficiencyScore,
      efficiencyComment,
      qualityScore,
      qualityComment,
      trajectoryAnalysis,
    })

    return NextResponse.json({ report })
  } catch (err) {
    return apiError('创建修订版失败：' + errorMessage(err), 500)
  }
}
