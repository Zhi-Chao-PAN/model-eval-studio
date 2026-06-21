import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { createReportRevision } from '@/lib/report-versioning'

// 获取单条报告详情（含生成依据快照）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; reportId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, modelId, reportId } = await params

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
    select: { id: true },
  })
  if (!model) return apiError('任务不存在', 404)

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

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
    select: { id: true },
  })
  if (!model) return apiError('任务不存在', 404)

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

    // 基本校验
    if (overallScore !== undefined && (overallScore < 1 || overallScore > 10 || !Number.isInteger(overallScore))) {
      return apiError('综合评分必须是 1-10 的整数', 400)
    }
    if (efficiencyScore !== undefined && (efficiencyScore < 1 || efficiencyScore > 10)) {
      return apiError('交付效率评分必须在 1-10 之间', 400)
    }
    if (qualityScore !== undefined && (qualityScore < 1 || qualityScore > 10)) {
      return apiError('产物质量评分必须在 1-10 之间', 400)
    }

    const report = await createReportRevision({
      taskModelId: modelId,
      parentReportId: reportId,
      source: 'MANUAL',
      editedById: session.userId,
      editNote: editNote || null,
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
