import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { encrypt, decrypt } from '@/lib/crypto'

// 获取 AI 配置（不返回 apiKey 明文）
export async function GET() {
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

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }

  return NextResponse.json({
    config: {
      provider: user.aiProvider,
      baseUrl: user.aiBaseUrl,
      modelName: user.aiModelName,
      hasApiKey: !!user.aiApiKey,
    },
  })
}

// 更新 AI 配置
export async function PUT(request: Request) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { provider, baseUrl, apiKey, modelName } = await request.json()
  if (!provider || !baseUrl || !modelName) {
    return NextResponse.json({ error: 'provider、baseUrl、modelName 必填' }, { status: 400 })
  }

  const data: any = {
    aiProvider: provider,
    aiBaseUrl: baseUrl,
    aiModelName: modelName,
  }

  // 只有传了 apiKey 才更新
  if (apiKey) {
    data.aiApiKey = encrypt(apiKey)
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: {
      aiProvider: true,
      aiBaseUrl: true,
      aiModelName: true,
      aiApiKey: true,
    },
  })

  return NextResponse.json({
    config: {
      provider: user.aiProvider,
      baseUrl: user.aiBaseUrl,
      modelName: user.aiModelName,
      hasApiKey: !!user.aiApiKey,
    },
  })
}
