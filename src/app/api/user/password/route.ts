import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

const MAX_PASSWORD_LENGTH = 200
const MIN_PASSWORD_LENGTH = 8

export async function PUT(request: Request) {
  const startedAt = Date.now()

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let sessionUserId = ''

  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    sessionUserId = session.userId

    // Rate limit password changes to prevent brute-force of current password
    const rl = await consumeRateLimit({
      scope: 'user-password-change',
      identifier: session.userId,
      limit: 10,
      windowMs: 30 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { currentPassword, newPassword } = body as Record<string, unknown>

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      errorMsg = '当前密码和新密码必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errorMsg = `新密码长度不能少于 ${MIN_PASSWORD_LENGTH} 个字符`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      errorMsg = `新密码长度不能超过 ${MAX_PASSWORD_LENGTH} 个字符`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (currentPassword === newPassword) {
      errorMsg = '新密码不能与当前密码相同'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Fetch user with password hash
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    })
    if (!user) {
      errorMsg = '用户不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      errorMsg = '当前密码错误'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: newHash },
    })

    status = 'success'
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message } = safeServerError(err, 'user-password-change')
    errorMsg = message
    return NextResponse.json({ error: '修改密码失败：' + message }, { status: 500 })
  } finally {
    if (sessionUserId) {
      logAudit(request, {
        action: 'PASSWORD_CHANGE',
        userId: sessionUserId,
        status,
        error: errorMsg,
        durationMs: Date.now() - startedAt,
      })
    }
  }
}
