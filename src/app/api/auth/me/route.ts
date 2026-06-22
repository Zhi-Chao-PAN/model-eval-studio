import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'

export async function GET() {
  try {
    const session = await getSession()
    if (!session.userId) {
      return NextResponse.json({ user: null })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ user: null })
    }

    // Fire-and-forget: update lastActiveAt without blocking the response.
    // Wrap in try/catch to avoid crashing the GET if the update fails.
    prisma.user.update({
      where: { id: session.userId },
      data: { lastActiveAt: new Date() },
    }).catch((err) => {
      console.warn('[auth:me] failed to update lastActiveAt:', err instanceof Error ? err.message : String(err))
    })

    return NextResponse.json({ user })
  } catch (err) {
    const { message } = safeServerError(err, 'auth-me')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
