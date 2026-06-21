import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError } from '@/lib/api-error'

// 获取某个模型的所有报告版本列表
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, modelId } = await params

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
    select: { id: true },
  })
  if (!model) return apiError('任务不存在', 404)

  const reports = await prisma.modelReport.findMany({
    where: { taskModelId: modelId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      source: true,
      parentReportId: true,
      editedById: true,
      editNote: true,
      overallScore: true,
      efficiencyScore: true,
      qualityScore: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ reports })
}
