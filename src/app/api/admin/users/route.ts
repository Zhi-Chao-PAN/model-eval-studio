import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'

export async function GET() {
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
      createdAt: true,
      lastActiveAt: true,
      _count: { select: { tasks: true } },
    },
  })

  return NextResponse.json({ users })
}
