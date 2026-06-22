import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'

export async function POST() {
  try {
    const session = await getSession()
    session.destroy()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message } = safeServerError(err, 'auth-logout')
    return NextResponse.json({ error: '退出登录失败：' + message }, { status: 500 })
  }
}
