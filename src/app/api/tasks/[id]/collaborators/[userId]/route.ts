import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, safeServerError } from '@/lib/api-error'
import { getTaskAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

// 修改协作者角色
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)

    // Rate limit collaborator role changes
    const rl = await consumeRateLimit({
      scope: 'collaborator-change',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, userId } = await params
    if (!isValidCuid(id) || !isValidCuid(userId)) {
      return apiError('参数格式无效', 400)
    }

    const { access } = await getTaskAccess(id, session)
    if (!access) return apiError('任务不存在', 404)
    if (access !== 'OWNER') {
      return apiError('只有任务创建者可以管理协作者', 403)
    }

    if (userId === session.userId) {
      return apiError('不能修改自己的协作角色', 400)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('请求内容格式无效', 400)
    }
    const { role } = body as Record<string, unknown>

    if (!['VIEWER', 'EDITOR'].includes(String(role))) {
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
      data: { role: String(role) as 'VIEWER' | 'EDITOR' },
      include: {
        user: { select: { id: true, username: true, role: true } },
      },
    })

    logAudit(request, {
      action: 'COLLABORATOR_UPDATE',
      userId: session.userId,
      taskId: id,
      status: 'success',
      detail: { targetUserId: userId, newRole: role },
    })

    return NextResponse.json({ collaborator: updated })
  } catch (err) {
    const { message } = safeServerError(err, 'collaborator-update')
    return apiError('修改协作者失败：' + message, 500)
  }
}

// 移除协作者
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)

    // Rate limit collaborator removal
    const rl = await consumeRateLimit({
      scope: 'collaborator-remove',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, userId } = await params
    if (!isValidCuid(id) || !isValidCuid(userId)) {
      return apiError('参数格式无效', 400)
    }

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

    logAudit(request, {
      action: 'COLLABORATOR_REMOVE',
      userId: session.userId,
      taskId: id,
      status: 'success',
      detail: { removedUserId: userId, selfLeave: userId === session.userId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message } = safeServerError(err, 'collaborator-remove')
    return apiError('移除协作者失败：' + message, 500)
  }
}
