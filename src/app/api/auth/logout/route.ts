import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    const session = await getSession()
    const userId = session.userId
    session.destroy()
    logAudit(request, {
      action: 'LOGOUT',
      userId: userId || null,
      status: 'success',
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message } = safeServerError(err, 'auth-logout')
    return NextResponse.json({ error: '退出登录失败：' + message }, { status: 500 })
  }
}
