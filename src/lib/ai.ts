import OpenAI from 'openai'
import { type AiProvider } from '@prisma/client'

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateOptions {
  baseUrl: string
  apiKey: string
  model: string
  provider: AiProvider
  temperature?: number
  maxTokens?: number
}

export async function generateChat(
  messages: AiMessage[],
  options: GenerateOptions
): Promise<string> {
  const { baseUrl, apiKey, model, provider, temperature = 0.7, maxTokens = 4000 } = options

  if (provider === 'ANTHROPIC_COMPAT') {
    return generateChatAnthropic(messages, { baseUrl, apiKey, model, temperature, maxTokens })
  }

  return generateChatOpenai(messages, { baseUrl, apiKey, model, temperature, maxTokens })
}

async function generateChatOpenai(
  messages: AiMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number }
): Promise<string> {
  const openai = new OpenAI({
    baseURL: options.baseUrl,
    apiKey: options.apiKey,
  })

  const response = await openai.chat.completions.create({
    model: options.model,
    messages: messages as any,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  })

  return response.choices[0]?.message?.content || ''
}

async function generateChatAnthropic(
  messages: AiMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number }
): Promise<string> {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content)
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system')

  const anthropicMessages = nonSystemMsgs.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))

  const body: any = {
    model: options.model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    messages: anthropicMessages,
  }
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.join('\n\n')
  }

  const res = await fetch(`${options.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error: ${res.status} ${errText}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text || ''
}

export async function validateApiKey(options: GenerateOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    await generateChat(
      [{ role: 'user', content: 'hi' }],
      { ...options, maxTokens: 10 }
    )
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Unknown error' }
  }
}

/**
 * Vision/image-understanding via OpenAI-compatible chat completions.
 *
 * Implementation notes:
 * - Uses raw fetch (not OpenAI SDK) so we can send `max_completion_tokens`,
 *   which MiniMax requires for vision calls instead of `max_tokens`.
 * - Sends both fields for compatibility with stricter OpenAI/Azure deployments.
 * - Doesn't pass `detail: 'auto'` because MiniMax only accepts `low`/`default`/`high`;
 *   omitting the field lets the upstream pick its own default.
 * - Throws on non-2xx with the upstream body verbatim, so callers can surface
 *   actionable error messages instead of an opaque 500.
 */
export async function analyzeImages(
  imageUrls: string[],
  prompt: string,
  options: GenerateOptions
): Promise<string> {
  if (options.provider === 'ANTHROPIC_COMPAT') {
    throw new Error('图片分析仅支持 OpenAI 兼容模式，请在设置中切换 provider 后重试')
  }

  if (!imageUrls.length) {
    throw new Error('至少需要 1 张图片')
  }

  const content: any[] = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({
      type: 'image_url',
      image_url: { url },
    })),
  ]

  const body = {
    model: options.model,
    messages: [{ role: 'user', content }],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4000,
    max_completion_tokens: options.maxTokens ?? 4000,
  }

  const url = options.baseUrl.replace(/\/$/, '') + '/chat/completions'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    let detail = errText
    try {
      const parsed = JSON.parse(errText)
      detail = parsed?.error?.message || parsed?.message || errText
    } catch {}
    throw new Error(`视觉模型调用失败 (HTTP ${res.status})：${detail || '上游返回为空'}`)
  }

  const data = await res.json()
  // Strip <think>...</think> blocks from output (MiniMax M3 reasoning chatter)
  const raw = data?.choices?.[0]?.message?.content || ''
  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}