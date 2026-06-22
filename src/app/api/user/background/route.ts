import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { clampDbText } from '@/lib/utils'
import { safeServerError } from '@/lib/api-error'

// User background is the organizational/evaluation context text fed into AI
// prompts. It is plain text (not markdown/code) so 50k chars is a generous
// upper bound (≈15-20 pages).
const MAX_BACKGROUND_CHARS = 50_000

// 获取背景
export async function GET() {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, background: true },
    })
    return NextResponse.json({ user })
  } catch (err) {
    const { message } = safeServerError(err, 'user-background-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 更新用户背景
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { background: raw } = body as { background?: unknown }
    if (typeof raw !== 'string') {
      errorMsg = 'background 必须是字符串'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (raw.length > MAX_BACKGROUND_CHARS * 2) {
      // Reject clearly oversize inputs early rather than silently truncating
      errorMsg = `背景文本过长（最多 ${MAX_BACKGROUND_CHARS} 字）`
      return NextResponse.json({ error: errorMsg }, { status: 413 })
    }

    const background = clampDbText(raw, MAX_BACKGROUND_CHARS)

    const user = await prisma.user.update({
      where: { id: sessionUserId },
      data: { background },
      select: { id: true, username: true, background: true },
    })

    status = 'success'
    return NextResponse.json({ user })
  } catch (err) {
    const { message } = safeServerError(err, 'user-background-update')
    errorMsg = message
    return NextResponse.json({ error: '更新背景失败：' + message }, { status: 500 })
  } finally {
    if (sessionUserId) {
      logAudit(request, {
        action: 'USER_SETTINGS_UPDATE',
        userId: sessionUserId,
        status,
        error: errorMsg,
        durationMs: Date.now() - startedAt,
      })
    }
  }
}
