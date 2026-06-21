import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { getTaskAccess } from '@/lib/task-access'

// 修改协作者角色
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, userId } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)
  if (access !== 'OWNER') {
    return apiError('只有任务创建者可以管理协作者', 403)
  }

  try {
    const body = await request.json()
    const { role } = body

    if (!['VIEWER', 'EDITOR'].includes(role)) {
      return apiError('角色必须是 VIEWER 或 EDITOR', 400)
    }

    const collaborator = await prisma.taskCollaborator.findFirst({
      where: { taskId: id, userId },
    })
    if (!collaborator) {
      return apiError('协作者不存在', 404)
    }

    const updated = await prisma.taskCollaborator.update({
      where: { id: collaborator.id },
      data: { role },
      include: {
        user: { select: { id: true, username: true, role: true } },
      },
    })

    return NextResponse.json({ collaborator: updated })
  } catch (err) {
    return apiError('修改协作者失败：' + errorMessage(err), 500)
  }
}

// 移除协作者
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, userId } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)

  // 自己可以退出协作，只有 Owner 可以移除他人
  if (userId !== session.userId && access !== 'OWNER') {
    return apiError('无权限移除协作者', 403)
  }

  const collaborator = await prisma.taskCollaborator.findFirst({
    where: { taskId: id, userId },
  })
  if (!collaborator) {
    return apiError('协作者不存在', 404)
  }

  await prisma.taskCollaborator.delete({
    where: { id: collaborator.id },
  })

  return NextResponse.json({ success: true })
}
