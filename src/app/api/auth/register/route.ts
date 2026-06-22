import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

class RegistrationError extends Error {}

// Usernames allow:
//  - ASCII letters, digits
//  - CJK Unified Ideographs (Chinese/Japanese/Korean characters)
//  - underscore, hyphen, dot separators (no leading/trailing due to trim)
// Prohibits: whitespace, control chars, angle brackets, slashes, quotes,
// backslashes, @ (reserved for future email login), etc.
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,32}$/u
const MAX_INVITE_CODE_LENGTH = 64
const MAX_PASSWORD_LENGTH = 200

export async function POST(request: Request) {
  const startedAt = Date.now()
  let userId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let username = ''

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

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

    if (inviteCode.length > MAX_INVITE_CODE_LENGTH) {
      errorMsg = '邀请码格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (!USERNAME_RE.test(username)) {
      errorMsg = '用户名仅允许 3-32 位中英文、数字、下划线、连字符或点'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (password.length < 8) {
      errorMsg = '密码长度不能少于 8 个字符'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      errorMsg = '密码长度不能超过 200 个字符'
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

    // Regenerate session on privilege change (login after registration) to
    // prevent session fixation. iron-session save() rotates the cookie.
    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = user.role as 'ADMIN' | 'USER'
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
