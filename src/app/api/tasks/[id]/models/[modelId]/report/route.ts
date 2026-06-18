import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id, modelId } = await params

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id } },
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
  const { modelId } = await params
  const { productFeedback, overallScore, overallComment, efficiencyScore, efficiencyComment, qualityScore, qualityComment } = await request.json()

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId } },
  })
  if (!model) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const report = await prisma.modelReport.create({
    data: {
      taskModelId: modelId,
      productFeedback: productFeedback || '',
      overallScore: overallScore || 0,
      overallComment: overallComment || '',
      efficiencyScore: efficiencyScore || 0,
      efficiencyComment: efficiencyComment || '',
      qualityScore: qualityScore || 0,
      qualityComment: qualityComment || '',
    },
  })

  return NextResponse.json({ report })
}