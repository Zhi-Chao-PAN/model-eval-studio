import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { parseTrajectoryScreenshots } from '@/lib/trajectory-screenshots'
import { apiError } from '@/lib/api-error'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, modelId } = await params

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'VIEWER')
  if (denied) return apiError(denied.error, denied.status)

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, taskId: id },
    select: { id: true, screenshotUrls: true, modelCode: true },
  })
  if (!model) return apiError('模型不存在', 404)

  const screenshots = parseTrajectoryScreenshots(model.screenshotUrls)

  return NextResponse.json({
    modelId: model.id,
    modelCode: model.modelCode,
    screenshots,
  })
}
