import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { createReportRevision } from '@/lib/report-versioning'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

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
    if (report.generationSnapshot) {
      generationSnapshot = JSON.parse(report.generationSnapshot)
    }
    if (report.generationConfig) {
      generationConfig = JSON.parse(report.generationConfig)
    }
  } catch {
    // 解析失败不影响主流程
  }

  return NextResponse.json({
    report: {
      ...report,
      generationSnapshot,
      generationConfig,
    },
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

    // 基本校验：综合分整数 1-10，效率/质量 0.5 步长
    function validateScore(v: unknown, label: string, step: number): string | null {
      if (v === undefined || v === null) return null
      if (typeof v !== 'number' || Number.isNaN(v)) return label + '必须是数字'
      if (v < 1 || v > 10) return label + '必须在 1-10 之间'
      const multiples = 1 / step
      if (Math.round(v * multiples) / multiples !== v) return label + '的步长必须为 ' + step
      return null
    }
    const errs = [
      validateScore(overallScore, '综合评分', 1),
      validateScore(efficiencyScore, '交付效率', 0.5),
      validateScore(qualityScore, '产物质量', 0.5),
    ].filter(Boolean) as string[]
    if (errs.length > 0) return apiError(errs.join('；'), 400)

    // editNote 长度限制（截断到 500 字符以内）
    const safeEditNote = typeof editNote === 'string' && editNote.trim() ? editNote.trim().slice(0, 500) : null

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
