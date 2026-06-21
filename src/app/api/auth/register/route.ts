import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

class RegistrationError extends Error {}

export async function POST(request: Request) {
  const startedAt = Date.now()
  let userId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let username = ''

  try {
    const body = await request.json()
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : ''
    username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!inviteCode || !username || !password) {
      errorMsg = '邀请码、用户名、密码必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rateLimit = await consumeRateLimit({
      scope: 'auth-register',
      identifier: getRequestIp(request),
      limit: 5,
      windowMs: 60 * 60_000,
    })
    if (!rateLimit.allowed) {
      errorMsg = '注册请求过于频繁'
      return rateLimitResponse(rateLimit)
    }
    if (username.length < 3 || username.length > 32) {
      errorMsg = '用户名长度需为 3-32 个字符'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (password.length < 8 || password.length > 128) {
      errorMsg = '密码长度需为 8-128 个字符'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 10)
    let user
    try {
      user = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { username },
          select: { id: true },
        })
        if (existing) throw new RegistrationError('用户名已被占用')

        const invite = await tx.inviteCode.findUnique({ where: { code: inviteCode } })
        if (!invite || !invite.active) throw new RegistrationError('邀请码无效')
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          throw new RegistrationError('邀请码已过期')
        }

        const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "InviteCode"
          SET "usedCount" = "usedCount" + 1
          WHERE "id" = ${invite.id}
            AND "active" = TRUE
            AND ("expiresAt" IS NULL OR "expiresAt" >= NOW())
            AND "usedCount" < "maxUses"
          RETURNING "id"
        `)
        if (claimed.length === 0) {
          throw new RegistrationError('邀请码使用次数已达上限')
        }

        return tx.user.create({
          data: {
            username,
            passwordHash: hashed,
            role: 'USER',
          },
        })
      })
    } catch (error) {
      if (error instanceof RegistrationError) {
        errorMsg = error.message
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        errorMsg = '用户名已被占用'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      throw error
    }

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
