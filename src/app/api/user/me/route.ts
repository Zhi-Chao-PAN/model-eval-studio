import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'

/**
 * GET /api/user/me
 * Returns the current authenticated user's basic profile (id, username, role).
 * Used by client components to know who the current user is.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    return NextResponse.json({
      id: session.userId,
      username: session.username,
      role: session.role,
    })
  } catch (err) {
    const { message } = safeServerError(err, 'user-me')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
