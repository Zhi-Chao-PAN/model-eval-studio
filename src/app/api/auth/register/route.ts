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
    const inviteCode = body.inviteCode || ''
    username = body.username || ''
    const password = body.password || ''

    if (!inviteCode || !username || !password) {
      errorMsg = '邀请码、用户名、密码必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 找邀请码
    const invite = await prisma.inviteCode.findFirst({
      where: {
        code: inviteCode,
        active: true,
      },
    })

    if (!invite) {
      errorMsg = '邀请码无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      errorMsg = '邀请码已过期'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (invite.usedCount >= invite.maxUses) {
      errorMsg = '邀请码使用次数已达上限'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 用户名是否已存在
    const existing = await prisma.user.findUnique({ where: { username } })
    if (existing) {
      errorMsg = '用户名已被占用'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 创建用户
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashed,
        role: 'USER',
      },
    })

    // 更新邀请码使用次数
    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedCount: { increment: 1 } },
    })

    // 登录
    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = user.role as any
    await session.save()

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
      action: 'REGISTER',
      userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { username },
    })
  }
}
