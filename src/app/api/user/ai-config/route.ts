import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { encrypt } from '@/lib/crypto'
import { logAudit } from '@/lib/audit'
import { assertSafeAiBaseUrl, parseAiMaxTokens, parseAiProvider } from '@/lib/ai-endpoint'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

const MAX_MODEL_NAME_LENGTH = 120
const MIN_API_KEY_LENGTH = 4
const MAX_API_KEY_LENGTH = 500

// 获取 AI 配置（不返回 apiKey 明文）
export async function GET() {
  try {
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
  } catch (err) {
    const { message } = safeServerError(err, 'ai-config-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 更新 AI 配置
export async function PUT(request: Request) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // Settings writes are cheap but should still be throttled to prevent
  // runaway encrypt() churn if a session is abused.
  const rl = await consumeRateLimit({
    scope: 'ai-config-update',
    identifier: session.userId,
    limit: 20,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelName = ''

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const {
      provider: providerInput,
      baseUrl: baseUrlInput,
      apiKey: apiKeyInput,
      modelName: mn,
      maxTokens,
    } = body as Record<string, unknown>

    modelName = typeof mn === 'string' ? mn.trim() : ''

    if (typeof providerInput !== 'string' || !providerInput.trim()) {
      errorMsg = 'provider 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (typeof baseUrlInput !== 'string' || !baseUrlInput.trim()) {
      errorMsg = 'baseUrl 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (!modelName) {
      errorMsg = 'modelName 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (modelName.length > MAX_MODEL_NAME_LENGTH) {
      errorMsg = `modelName 不能超过 ${MAX_MODEL_NAME_LENGTH} 个字符`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // Validate apiKey (if provided) before any network/encryption work
    let encryptedApiKey: string | undefined
    if (apiKeyInput !== undefined && apiKeyInput !== null && apiKeyInput !== '') {
      if (typeof apiKeyInput !== 'string') {
        errorMsg = 'apiKey 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      const trimmedKey = apiKeyInput.trim()
      if (trimmedKey.length < MIN_API_KEY_LENGTH) {
        errorMsg = `apiKey 长度不能少于 ${MIN_API_KEY_LENGTH} 个字符`
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      if (trimmedKey.length > MAX_API_KEY_LENGTH) {
        errorMsg = `apiKey 不能超过 ${MAX_API_KEY_LENGTH} 个字符`
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      encryptedApiKey = encrypt(trimmedKey)
    }

    let provider
    let baseUrl
    let normalizedMaxTokens
    try {
      provider = parseAiProvider(providerInput.trim())
      baseUrl = await assertSafeAiBaseUrl(baseUrlInput)
      normalizedMaxTokens = parseAiMaxTokens(maxTokens)
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const data: {
      aiProvider: typeof provider
      aiBaseUrl: string
      aiModelName: string
      aiMaxTokens: number
      aiApiKey?: string
    } = {
      aiProvider: provider,
      aiBaseUrl: baseUrl,
      aiModelName: modelName,
      aiMaxTokens: normalizedMaxTokens,
    }

    if (encryptedApiKey) {
      data.aiApiKey = encryptedApiKey
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
  } catch (err) {
    const { message } = safeServerError(err, 'ai-config-update')
    errorMsg = message
    return NextResponse.json({ error: '更新 AI 配置失败：' + message }, { status: 500 })
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
