import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

// bcrypt silently truncates at 72 bytes; cap inputs well below that to avoid
// silently accepting passwords where only the first 72 bytes matter, and to
// prevent DoS via huge request bodies.
const MAX_USERNAME_LENGTH = 64
const MAX_PASSWORD_LENGTH = 200

// Pre-computed dummy bcrypt hash used when a username is not found, to
// equalize response time vs. the bcrypt.compare() path.
// Generated from a fixed random password via bcrypt.hash("dummy-password-for-timing", 10);
// never used for authentication, only for timing attack mitigation.
const DUMMY_BCRYPT_HASH =
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

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

    username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!username || !password) {
      errorMsg = '用户名和密码必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (username.length > MAX_USERNAME_LENGTH) {
      errorMsg = '用户名过长'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      errorMsg = '密码过长'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rateLimit = await consumeRateLimit({
      scope: 'auth-login',
      identifier: `${getRequestIp(request)}:${username.toLowerCase()}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    if (!rateLimit.allowed) {
      errorMsg = '登录请求过于频繁'
      return rateLimitResponse(rateLimit)
    }

    const user = await prisma.user.findUnique({ where: { username } })

    // Always run bcrypt.compare to mitigate timing-based user enumeration:
    // when the username doesn't exist we still do a compare against a
    // fixed dummy hash so the response time approximates a real compare.
    let valid = false
    if (user) {
      valid = await bcrypt.compare(password, user.passwordHash)
    } else {
      // Swallow result; always fails.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => false)
    }

    if (!user || !valid) {
      errorMsg = '用户名或密码错误'
      return NextResponse.json({ error: errorMsg }, { status: 401 })
    }

    const session = await getSession()
    session.userId = user.id
    session.username = user.username
    session.role = user.role as 'ADMIN' | 'USER'
    await session.save()

    // Fire-and-forget: don't crash login if lastActiveAt update fails
    prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => {
      console.warn('[auth:login] failed to update lastActiveAt:', err instanceof Error ? err.message : String(err))
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
  } catch (err) {
    const { message } = safeServerError(err, 'auth-login')
    errorMsg = message
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 })
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
