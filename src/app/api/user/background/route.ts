import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// 获取背景
export async function GET() {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, background: true },
  })
  return NextResponse.json({ user })
}

// 更新用户背景
export async function PUT(request: Request) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null

  try {
    const body = await request.json()
    const { background } = body
    if (typeof background !== 'string') {
      errorMsg = 'background 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { background },
      select: { id: true, username: true, background: true },
    })

    status = 'success'
    return NextResponse.json({ user })
  } finally {
    logAudit(request, {
      action: 'USER_SETTINGS_UPDATE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
    })
  }
}
