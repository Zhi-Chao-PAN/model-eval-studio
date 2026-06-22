import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, safeServerError } from '@/lib/api-error'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

// 获取某个模型的所有报告版本列表
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)
    const { id, modelId } = await params

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return apiError(denied.error, denied.status)

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true },
    })
    if (!model) return apiError('模型不存在', 404)

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
  } catch (err) {
    const { message } = safeServerError(err, 'reports-list')
    return apiError(message, 500)
  }
}
