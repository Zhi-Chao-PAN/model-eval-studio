import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { decrypt } from '@/lib/crypto'
import { validateApiKey, sanitizeAiError } from '@/lib/ai'
import { apiError } from '@/lib/api-error'

// 验证 AI 配置是否可用
// - 请求体为空：验证当前已保存的配置
// - 请求体包含 provider/baseUrl/apiKey/modelName：验证传入的临时配置（不写入 DB）
export async function POST(request: Request) {
  const session = await requireAuth()
  if (!session) {
    return apiError('未登录', 401)
  }

  let provider: string
  let baseUrl: string
  let apiKey: string
  let model: string

  let body: { provider?: string; baseUrl?: string; apiKey?: string; modelName?: string } | null = null
  try {
    body = await request.json()
  } catch {
    // 没有 body，使用 DB 中已保存的配置
  }

  if (body && body.baseUrl && body.apiKey && body.modelName) {
    // 使用传入的临时配置（测试未保存的配置）
    provider = body.provider || 'OPENAI_COMPAT'
    baseUrl = body.baseUrl
    apiKey = body.apiKey
    model = body.modelName
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
