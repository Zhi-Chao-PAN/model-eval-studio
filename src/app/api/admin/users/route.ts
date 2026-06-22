import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'

export async function GET(request: Request) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const rl = await consumeRateLimit({
      scope: 'admin-users',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        background: true,
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: { tasks: true },
        },
      },
    })

    logAudit(request, {
      action: 'ADMIN_USER_VIEW',
      userId: session.userId,
      status: 'success',
    })

    return NextResponse.json({ users })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-users')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/users
 * Update a user's role (ADMIN <-> USER).
 * Prevents self-demotion to avoid losing admin access.
 */
export async function PATCH(request: Request) {
  const startedAt = Date.now()
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let targetUserId: string | null = null
  let newRole: string | null = null
  let actorUserId: string | null = null

  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }
    actorUserId = session.userId

    const rl = await consumeRateLimit({
      scope: 'admin-user-update',
      identifier: session.userId,
      limit: 20,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      errorMsg = '请求体格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { userId, role } = body as Record<string, unknown>
    if (typeof userId !== 'string' || !isValidCuid(userId)) {
      errorMsg = '用户 ID 格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (role !== 'ADMIN' && role !== 'USER') {
      errorMsg = '角色必须是 ADMIN 或 USER'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    targetUserId = userId
    newRole = role

    // Prevent self-demotion: an admin cannot demote themselves
    if (userId === session.userId && role !== 'ADMIN') {
      errorMsg = '不能修改自己的管理员角色'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true },
    })
    if (!user) {
      errorMsg = '用户不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    if (user.role === role) {
      errorMsg = '用户已经是该角色'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    })

    status = 'success'
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-user-patch')
    errorMsg = message
    return NextResponse.json({ error: '更新用户角色失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'ADMIN_USER_ROLE_UPDATE',
      userId: actorUserId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: targetUserId ? { targetUserId, newRole } : undefined,
    })
  }
}
