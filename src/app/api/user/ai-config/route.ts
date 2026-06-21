import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { encrypt, decrypt } from '@/lib/crypto'
import { logAudit } from '@/lib/audit'
import { assertSafeAiBaseUrl, parseAiMaxTokens, parseAiProvider } from '@/lib/ai-endpoint'

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
      aiMaxTokens: true,
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
      maxTokens: user.aiMaxTokens,
      hasApiKey: !!user.aiApiKey,
    },
  })
}

// 更新 AI 配置
export async function PUT(request: Request) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelName = ''

  try {
    const body = await request.json()
    const { provider: providerInput, baseUrl: baseUrlInput, apiKey, modelName: mn, maxTokens } = body
    modelName = typeof mn === 'string' ? mn.trim() : ''

    if (!providerInput || !baseUrlInput || !modelName) {
      errorMsg = 'provider、baseUrl、modelName 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    let provider
    let baseUrl
    let normalizedMaxTokens
    try {
      provider = parseAiProvider(providerInput)
      baseUrl = await assertSafeAiBaseUrl(baseUrlInput)
      normalizedMaxTokens = parseAiMaxTokens(maxTokens)
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const data: any = {
      aiProvider: provider,
      aiBaseUrl: baseUrl,
      aiModelName: modelName,
      aiMaxTokens: normalizedMaxTokens,
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
        aiMaxTokens: true,
      },
    })

    status = 'success'
    return NextResponse.json({
      config: {
        provider: user.aiProvider,
        baseUrl: user.aiBaseUrl,
        modelName: user.aiModelName,
        maxTokens: user.aiMaxTokens,
        hasApiKey: !!user.aiApiKey,
      },
    })
  } finally {
    logAudit(request, {
      action: 'AI_CONFIG_UPDATE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelName },
    })
  }
}
