import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

// 更新用户背景
export async function PUT(request: Request) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { background } = await request.json()
  if (typeof background !== 'string') {
    return NextResponse.json({ error: 'background 必填' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { background },
    select: { id: true, username: true, background: true },
  })

  return NextResponse.json({ user })
}
