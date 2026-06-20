import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  const startedAt = Date.now()
  let userId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let username = ''

  try {
    const body = await request.json()
    username = body.username || ''
    const password = body.password || ''

    if (!username || !password) {
      errorMsg = '用户名和密码必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      errorMsg = '用户名或密码错误'
      return NextResponse.json({ error: errorMsg }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      errorMsg = '用户名或密码错误'
      return NextResponse.json({ error: errorMsg }, { status: 401 })
    }

    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = user.role as any
    await session.save()

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    })

    userId = user.id
    status = 'success'

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        hasBackground: !!user.background,
        hasAiConfig: !!user.aiApiKey,
      },
    })
  } finally {
    logAudit(request, {
      action: 'LOGIN',
      userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { username },
    })
  }
}
