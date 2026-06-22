import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { decrypt } from '@/lib/crypto'
import { validateApiKey, sanitizeAiError } from '@/lib/ai'
import { apiError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { normalizeAiBaseUrl, parseAiProvider, assertSafeAiBaseUrl } from '@/lib/ai-endpoint'

const MAX_VALIDATE_MODEL_NAME = 120
const MAX_VALIDATE_KEY = 500
const MAX_VALIDATE_URL = 500

// 验证 AI 配置是否可用
// - 请求体为空：验证当前已保存的配置
// - 请求体包含 provider/baseUrl/apiKey/modelName：验证传入的临时配置（不写入 DB）
export async function POST(request: Request) {
  const session = await requireAuth()
  if (!session) {
    return apiError('未登录', 401)
  }

  const rateLimit = await consumeRateLimit({
    scope: 'ai-config-validate',
    identifier: session.userId,
    limit: 10,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  let provider: string
  let baseUrl: string
  let apiKey: string
  let model: string

  const body = await request.json().catch(() => null)

  const hasInline =
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    typeof (body as any).baseUrl === 'string' &&
    typeof (body as any).apiKey === 'string' &&
    typeof (body as any).modelName === 'string'

  if (hasInline) {
    const b = body as { baseUrl: string; apiKey: string; modelName: string; provider?: unknown }
    // Length-cap inline credentials BEFORE any network/decrypt work
    if (b.baseUrl.length > MAX_VALIDATE_URL) {
      return NextResponse.json({ ok: false, error: 'Base URL 过长' }, { status: 400 })
    }
    if (b.apiKey.length > MAX_VALIDATE_KEY) {
      return NextResponse.json({ ok: false, error: 'API Key 过长' }, { status: 400 })
    }
    if (b.modelName.length > MAX_VALIDATE_MODEL_NAME) {
      return NextResponse.json({ ok: false, error: '模型名称过长' }, { status: 400 })
    }
    const trimmedKey = b.apiKey.trim()
    if (!trimmedKey) {
      return NextResponse.json({ ok: false, error: 'API Key 不能为空' }, { status: 400 })
    }
    let parsedProvider
    try {
      parsedProvider = parseAiProvider(b.provider || 'OPENAI_COMPAT')
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'provider 无效' }, { status: 400 })
    }
    try {
      // Use the full SSRF-safe validator (DNS resolution + private IP check)
      // even for inline test values to prevent SSRF attacks.
      baseUrl = await assertSafeAiBaseUrl(b.baseUrl)
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Base URL 无效' }, { status: 400 })
    }
    provider = parsedProvider
    apiKey = trimmedKey
    model = b.modelName.trim()
    if (!model) {
      return NextResponse.json({ ok: false, error: '模型名称不能为空' }, { status: 400 })
    }
  } else {
    // 使用 DB 中已保存的配置
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

    provider = user.aiProvider
    baseUrl = user.aiBaseUrl
    apiKey = decrypt(user.aiApiKey)
    model = user.aiModelName
  }

  const result = await validateApiKey({
    baseUrl,
    apiKey,
    model,
    provider: provider as any,
  })

  if (!result.ok && result.error) {
    const sanitized = sanitizeAiError(new Error(result.error))
    return NextResponse.json({
      ok: false,
      error: sanitized.message,
      category: sanitized.category,
    })
  }

  return NextResponse.json(result)
}
