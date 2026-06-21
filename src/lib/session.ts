import { cookies } from 'next/headers'
import { type SessionOptions } from 'iron-session'

export interface SessionData {
  userId: string
  username: string
  role: 'ADMIN' | 'USER'
}

function getSessionOptions(): SessionOptions {
  const configuredSecret = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error('生产环境必须配置至少 32 个字符的 SESSION_SECRET')
  }

  return {
    password: configuredSecret || 'dev-session-secret-please-change-in-production-32',
    cookieName: 'model-test-session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    },
  }
}

import { getIronSession } from 'iron-session'

export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, getSessionOptions())
}

export async function requireAuth() {
  const session = await getSession()
  if (!session.userId) {
    return null
  }
  return session
}

export async function requireAdmin() {
  const session = await getSession()
  if (!session.userId || session.role !== 'ADMIN') {
    return null
  }
  return session
}
