import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function POST(request: Request) {
  const startedAt = Date.now()
  const session = await getSession()
  const userId = session.userId || null
  session.destroy()

  logAudit(request, {
    action: 'LOGOUT',
    userId,
    status: 'success',
    durationMs: Date.now() - startedAt,
  })

  return NextResponse.json({ ok: true })
}
