import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { randomBytes } from 'crypto'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'

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
    const { maxUses = 1, expiresInDays = 7 } = body as Record<string, unknown>

    const code = randomBytes(8).toString('hex').toUpperCase()
    const expiresAt = new Date(Date.now() + (Number(expiresInDays) || 7) * 24 * 60 * 60 * 1000)

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        maxUses: Math.max(1, Math.min(100, Number(maxUses) || 1)),
        expiresAt,
        createdById: session.userId,
      },
    })

    logAudit(request, {
      action: 'ADMIN_INVITE_CREATE',
      userId: session.userId,
      status: 'success',
      detail: { code: invite.code },
    })

    return NextResponse.json({ invite })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-invite-create')
    return NextResponse.json({ error: '创建邀请码失败：' + message }, { status: 500 })
  }
}
