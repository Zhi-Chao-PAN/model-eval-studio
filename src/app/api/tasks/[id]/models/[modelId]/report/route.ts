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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id, modelId } = await params

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'VIEWER')
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, taskId: id },
    include: { reports: { orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

  return NextResponse.json({ report: model.reports[0] || null })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id, modelId } = await params
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
  } = await request.json()

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'EDITOR')
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, taskId: id },
  })
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

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

  // 严格校验评分，非法直接返回 400（与 generate-report 保持一致）
  let validatedOverallScore: number
  let validatedEfficiencyScore: number
  let validatedQualityScore: number
  try {
    validatedOverallScore = validateScore(overallScore, '综合评分')
    validatedEfficiencyScore = validateScore(efficiencyScore, '效率评分')
    validatedQualityScore = validateScore(qualityScore, '质量评分')
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '评分校验失败' }, { status: 400 })
  }

  const version = await getNextReportVersion(modelId)

  const report = await prisma.modelReport.create({
    data: {
      taskModelId: modelId,
      version,
      source: 'MANUAL',
      editedById: session.userId,
      productFeedback: productFeedback || '',
      verificationScreenshotUrls: storedEvidence,
      verificationSummary: verificationSummary || null,
      overallScore: validatedOverallScore,
      overallComment: overallComment || '',
      efficiencyScore: validatedEfficiencyScore,
      efficiencyComment: efficiencyComment || '',
      qualityScore: validatedQualityScore,
      qualityComment: qualityComment || '',
      trajectoryAnalysis: trajectoryAnalysis || '未提供轨迹截图。',
    },
  })

  return NextResponse.json({ report })
}

function validateScore(score: unknown, fieldName: string): number {
  const value = Number(score)
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} 必须是数字`)
  }
  if (value < 1 || value > 10) {
    throw new Error(`${fieldName} 必须在 1-10 之间`)
  }
  if (Math.round(value * 2) / 2 !== value) {
    throw new Error(`${fieldName} 精度必须为 0.5 的倍数`)
  }
  return value
}
