import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { decrypt } from '@/lib/crypto'
import { validateApiKey } from '@/lib/ai'

// 验证当前 AI 配置是否可用
export async function POST() {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      aiProvider: true,
      aiBaseUrl: true,
      aiModelName: true,
      aiApiKey: true,
    },
  })

  if (!user || !user.aiBaseUrl || !user.aiApiKey || !user.aiModelName) {
    return NextResponse.json({ ok: false, error: '请先完整配置 AI 信息' })
  }

  const apiKey = decrypt(user.aiApiKey)
  const result = await validateApiKey({
    baseUrl: user.aiBaseUrl,
    apiKey,
    model: user.aiModelName,
    provider: user.aiProvider as any,
  })

  return NextResponse.json(result)
}
