import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const { inviteCode, username, password } = await request.json()

  if (!inviteCode || !username || !password) {
    return NextResponse.json({ error: '邀请码、用户名、密码必填' }, { status: 400 })
  }

  // 找邀请码
  const invite = await prisma.inviteCode.findFirst({
    where: {
      code: inviteCode,
      active: true,
    },
  })

  if (!invite) {
    return NextResponse.json({ error: '邀请码无效' }, { status: 400 })
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: '邀请码已过期' }, { status: 400 })
  }

  if (invite.usedCount >= invite.maxUses) {
    return NextResponse.json({ error: '邀请码使用次数已达上限' }, { status: 400 })
  }

  // 用户名是否已存在
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json({ error: '用户名已被占用' }, { status: 400 })
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
}
