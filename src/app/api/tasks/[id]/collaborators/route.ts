import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { getTaskAccess, hasAccessLevel } from '@/lib/task-access'

// 列出任务协作者
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access || !hasAccessLevel(access, 'VIEWER')) {
    return apiError('任务不存在', 404)
  }

  const collaborators = await prisma.taskCollaborator.findMany({
    where: { taskId: id },
    include: {
      user: {
        select: { id: true, username: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ collaborators, currentUserAccess: access })
}

// 添加协作者（按用户名）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)
  // 只有 Owner 可以管理协作者
  if (access !== 'OWNER') {
    return apiError('只有任务创建者可以管理协作者', 403)
  }

  try {
    const body = await request.json()
    const { username, role = 'VIEWER' } = body

    if (!username || typeof username !== 'string') {
      return apiError('用户名必填', 400)
    }
    if (!['VIEWER', 'EDITOR'].includes(role)) {
      return apiError('角色必须是 VIEWER 或 EDITOR', 400)
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true },
    })
    if (!user) {
      return apiError('用户不存在', 404)
    }

    // 不能添加自己为协作者
    if (user.id === session.userId) {
      return apiError('不能添加自己为协作者', 400)
    }

    // 检查是否已经是协作者
    const existing = await prisma.taskCollaborator.findFirst({
      where: { taskId: id, userId: user.id },
    })
    if (existing) {
      return apiError('该用户已是协作者', 400)
    }

    const collaborator = await prisma.taskCollaborator.create({
      data: {
        taskId: id,
        userId: user.id,
        role,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
    })

    return NextResponse.json({ collaborator })
  } catch (err) {
    return apiError('添加协作者失败：' + errorMessage(err), 500)
  }
}
