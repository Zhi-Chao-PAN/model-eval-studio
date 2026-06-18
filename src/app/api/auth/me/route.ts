import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET() {
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
      background: true,
      aiProvider: true,
      aiBaseUrl: true,
      aiModelName: true,
      // 注意：不返回 apiKey
      lastActiveAt: true,
      createdAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ user: null })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  })

  return NextResponse.json({
    user: {
      ...user,
      hasAiConfig: !!user.aiBaseUrl,
    },
  })
}
