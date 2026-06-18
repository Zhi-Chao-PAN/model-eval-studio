import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const { username, password } = await request.json()
  if (!username || !password) {
    return NextResponse.json({ error: '用户名和密码必填' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
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
