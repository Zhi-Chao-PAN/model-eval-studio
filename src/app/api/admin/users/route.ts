import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    // Rate limit admin queries
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
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: { tasks: true },
        },
      },
    })

    // fire-and-forget audit log for read ops
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
