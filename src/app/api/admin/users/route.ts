import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function GET(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      role: true,
      background: true,
      aiProvider: true,
      aiBaseUrl: true,
      aiModelName: true,
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
}
