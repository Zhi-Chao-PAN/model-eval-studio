import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { randomBytes } from 'crypto'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { isValidCuid } from '@/lib/utils'

export async function GET() {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

    // Rate limit admin queries
    const rl = await consumeRateLimit({
      scope: 'admin-invites-list',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const invites = await prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { username: true } } },
    })

    return NextResponse.json({ invites })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-invites-list')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

    // Rate limit invite creation
    const rl = await consumeRateLimit({
      scope: 'admin-invite-create',
      identifier: session.userId,
      limit: 20,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const { maxUses = 1, expiresAt, expiresInDays, count = 1 } = body as Record<string, unknown>

    // Clamp values to safe ranges
    const safeMaxUses = Math.max(1, Math.min(100, Math.round(Number(maxUses) || 1)))
    const safeCount = Math.max(1, Math.min(100, Math.round(Number(count) || 1)))

    // Calculate expiry date: prefer expiresAt (ISO string) over expiresInDays, default 7 days
    let expiresAtDate: Date
    if (typeof expiresAt === 'string' && expiresAt) {
      const parsed = new Date(expiresAt)
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        expiresAtDate = parsed
      } else {
        expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    } else if (typeof expiresInDays === 'number' && expiresInDays > 0) {
      const days = Math.max(1, Math.min(365, Math.round(expiresInDays)))
      expiresAtDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    } else {
      expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }

    // Batch create invites
    const createdInvites = []
    for (let i = 0; i < safeCount; i++) {
      const code = randomBytes(8).toString('hex').toUpperCase()
      const invite = await prisma.inviteCode.create({
        data: {
          code,
          maxUses: safeMaxUses,
          expiresAt: expiresAtDate,
          createdById: session.userId,
        },
      })
      createdInvites.push(invite)
    }

    logAudit(request, {
      action: 'ADMIN_INVITE_CREATE',
      userId: session.userId,
      status: 'success',
      detail: { count: safeCount, codes: createdInvites.map(i => i.code) },
    })

    return NextResponse.json({ invites: createdInvites })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-invite-create')
    return NextResponse.json({ error: '创建邀请码失败：' + message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const rl = await consumeRateLimit({
      scope: 'admin-invite-update',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const { id, action } = body as Record<string, unknown>
    if (typeof id !== 'string' || !isValidCuid(id)) {
      return NextResponse.json({ error: '邀请码 ID 无效' }, { status: 400 })
    }

    const existing = await prisma.inviteCode.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '邀请码不存在' }, { status: 404 })
    }

    if (action === 'toggle') {
      const updated = await prisma.inviteCode.update({
        where: { id },
        data: { active: !existing.active },
      })
      logAudit(request, {
        action: 'ADMIN_INVITE_TOGGLE',
        userId: session.userId,
        status: 'success',
        detail: { code: existing.code, active: updated.active },
      })
      return NextResponse.json({ invite: updated })
    }

    return NextResponse.json({ error: '不支持的操作' }, { status: 400 })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-invite-update')
    return NextResponse.json({ error: '更新邀请码失败：' + message }, { status: 500 })
  }
}
