import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { parseTrajectoryScreenshots } from '@/lib/trajectory-screenshots'
import { apiError } from '@/lib/api-error'

export const runtime = 'nodejs'

async function findOwnedModel(taskId: string, modelId: string, userId: string) {
  return prisma.taskModel.findFirst({
    where: { id: modelId, task: { id: taskId, userId, status: { not: 'DELETED' } } },
    select: { id: true, screenshotUrls: true, modelCode: true },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, modelId } = await params

  const model = await findOwnedModel(id, modelId, session.userId)
  if (!model) return apiError('模型不存在', 404)

  const screenshots = parseTrajectoryScreenshots(model.screenshotUrls)

  return NextResponse.json({
    modelId: model.id,
    modelCode: model.modelCode,
    screenshots,
  })
}
