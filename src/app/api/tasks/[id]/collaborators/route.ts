import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { getTaskAccess, hasAccessLevel } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

const MAX_USERNAME_LENGTH = 64
const MAX_COLLABORATORS_PER_TASK = 50
const ALLOWED_ROLES = ['VIEWER', 'EDITOR'] as const

// Username pattern mirrors the register route: allow letters, numbers, CJK,
// . _ - (but NOT @ since usernames don't contain email domain parts)
const USERNAME_RE = /^[\p{L}\p{N}_.\-]{1,64}$/u

// 列出任务协作者
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id } = await params
    if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })

    const { access } = await getTaskAccess(id, session)
    if (!access || !hasAccessLevel(access, 'VIEWER')) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 })
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
  } catch (err) {
    const { message } = safeServerError(err, 'collaborators-list')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 添加协作者（按用户名）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (access !== 'OWNER') {
    return NextResponse.json({ error: '只有任务创建者可以管理协作者' }, { status: 403 })
  }

  const rl = await consumeRateLimit({
    scope: 'collaborator-add',
    identifier: session.userId,
    limit: 30,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const rawUsername = (body as { username?: unknown }).username
    const rawRole = (body as { role?: unknown }).role
    const role = typeof rawRole === 'string' && ALLOWED_ROLES.includes(rawRole as any)
      ? (rawRole as typeof ALLOWED_ROLES[number])
      : 'VIEWER'

    if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
      return NextResponse.json({ error: '用户名必填' }, { status: 400 })
    }
    const username = rawUsername.trim()
    if (username.length > MAX_USERNAME_LENGTH) {
      return NextResponse.json({ error: '用户名过长' }, { status: 400 })
    }
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: '用户名格式无效' }, { status: 400 })
    }
    if (rawRole !== undefined && (typeof rawRole !== 'string' || !ALLOWED_ROLES.includes(rawRole as any))) {
      return NextResponse.json({ error: '角色必须是 VIEWER 或 EDITOR' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    })
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    // Cannot add yourself; owner already has OWNER access implicitly
    if (user.id === session.userId) {
      return NextResponse.json({ error: '不能添加自己为协作者' }, { status: 400 })
    }

    // Check existing collaborator count (DoS: prevent adding thousands)
    const existingCount = await prisma.taskCollaborator.count({ where: { taskId: id } })
    if (existingCount >= MAX_COLLABORATORS_PER_TASK) {
      return NextResponse.json(
        { error: `协作者数量已达上限（${MAX_COLLABORATORS_PER_TASK} 人）` },
        { status: 400 },
      )
    }

    const existing = await prisma.taskCollaborator.findFirst({
      where: { taskId: id, userId: user.id },
    })
    if (existing) {
      return NextResponse.json({ error: '该用户已是协作者' }, { status: 400 })
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

    logAudit(request, {
      action: 'COLLABORATOR_ADD',
      userId: session.userId,
      taskId: id,
      status: 'success',
      detail: { addedUserId: user.id, addedUsername: user.username, role },
    })

    return NextResponse.json({ collaborator })
  } catch (err) {
    const { message } = safeServerError(err, 'collaborator-add')
    return NextResponse.json({ error: '添加协作者失败：' + message }, { status: 500 })
  }
}
