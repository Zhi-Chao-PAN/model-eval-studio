import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import {
  parseVerificationEvidence,
  serializeVerificationEvidence,
  validateVerificationEvidence,
} from '@/lib/verification-evidence'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id, modelId } = await params

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
    include: { reports: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  if (!model) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

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

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
  })
  if (!model) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

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

  const report = await prisma.modelReport.create({
    data: {
      taskModelId: modelId,
      productFeedback: productFeedback || '',
      verificationScreenshotUrls: storedEvidence,
      verificationSummary: verificationSummary || null,
      overallScore: normalizeOverallScore(overallScore),
      overallComment: overallComment || '',
      efficiencyScore: normalizeHalfScore(efficiencyScore),
      efficiencyComment: efficiencyComment || '',
      qualityScore: normalizeHalfScore(qualityScore),
      qualityComment: qualityComment || '',
      trajectoryAnalysis: trajectoryAnalysis || '未提供轨迹截图。',
    },
  })

  return NextResponse.json({ report })
}

function normalizeOverallScore(score: unknown): number {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(value)))
}

function normalizeHalfScore(score: unknown): number {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(value * 2) / 2))
}
