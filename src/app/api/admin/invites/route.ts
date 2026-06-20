import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// 获取所有邀请码
export async function GET(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { username: true } } },
  })

  return NextResponse.json({ invites })
}

// 创建邀请码
export async function POST(request: Request) {
  const startedAt = Date.now()
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let createdCount = 0

  try {
    const body = await request.json()
    const { count = 1, expiresAt, maxUses = 1 } = body

    const results = []
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase()
      const invite = await prisma.inviteCode.create({
        data: {
          code,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          maxUses: Number(maxUses) || 1,
          createdById: session.userId,
        },
      })
      results.push(invite)
    }
    createdCount = results.length
    status = 'success'

    return NextResponse.json({ invites: results })
  } finally {
    logAudit(request, {
      action: 'ADMIN_INVITE_CREATE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { count: createdCount },
    })
  }
}

// 批量操作（禁用/启用/删除）
export async function PATCH(request: Request) {
  const startedAt = Date.now()
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let actionName = ''
  let inviteCode = ''

  try {
    const body = await request.json()
    const { id, action } = body
    actionName = action

    if (!id || !action) {
      errorMsg = 'id 和 action 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (action === 'toggle') {
      const invite = await prisma.inviteCode.findUnique({ where: { id } })
      if (!invite) {
        errorMsg = '未找到'
        return NextResponse.json({ error: errorMsg }, { status: 404 })
      }
      inviteCode = invite.code
      const updated = await prisma.inviteCode.update({
        where: { id },
        data: { active: !invite.active },
      })
      status = 'success'
      return NextResponse.json({ invite: updated })
    }

    if (action === 'delete') {
      const invite = await prisma.inviteCode.findUnique({ where: { id } })
      inviteCode = invite?.code || ''
      await prisma.inviteCode.delete({ where: { id } })
      status = 'success'
      return NextResponse.json({ ok: true })
    }

    errorMsg = '未知操作'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  } finally {
    logAudit(request, {
      action: 'ADMIN_INVITE_TOGGLE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { action: actionName, code: inviteCode },
    })
  }
}
