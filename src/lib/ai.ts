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

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface GenerateResult {
  content: string
  usage: AiUsage | null
}

export async function generateChat(
  messages: AiMessage[],
  options: GenerateOptions
): Promise<GenerateResult> {
  const { baseUrl, apiKey, model, provider, temperature = 0.7, maxTokens = 4000 } = options

  if (provider === 'ANTHROPIC_COMPAT') {
    return generateChatAnthropic(messages, { baseUrl, apiKey, model, temperature, maxTokens })
  }

  return generateChatOpenai(messages, { baseUrl, apiKey, model, temperature, maxTokens })
}

async function generateChatOpenai(
  messages: AiMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number }
): Promise<GenerateResult> {
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

  const content = response.choices[0]?.message?.content || ''
  const usage = response.usage
    ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }
    : null

  return { content, usage }
}

async function generateChatAnthropic(
  messages: AiMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number }
): Promise<GenerateResult> {
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
  const content = data.content?.[0]?.text || ''
  const usage = data.usage
    ? {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      }
    : null

  return { content, usage }
}

/**
 * 对超长文本做智能摘要，保留关键信息。
 * 用于在上下文窗口有限时压缩输入内容。
 */
export async function summarizeText(
  text: string,
  options: GenerateOptions & { targetLength?: string; context?: string },
): Promise<GenerateResult> {
  const { targetLength = '原文的 20% 左右', context = '', ...genOpts } = options

  const systemPrompt = `你是专业的信息提取助手。你的任务是对给定文本做精准摘要，保留所有关键信息、数据、结论、问题点和具体细节，删除冗余和重复。`

  const userPrompt = `请对以下文本进行摘要，目标长度约为${targetLength}。

要求：
- 保留所有关键信息、具体数据、结论、错误、问题点
- 保留专有名词、技术术语、数字、代码片段
- 删除无意义的客套话、重复表述
- 保持原文的结构和逻辑顺序
- 用原文的语言输出

${context ? `【上下文背景】\n${context}\n\n` : ''}【待摘要文本】
${text}

【摘要结果】`

  return generateChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      ...genOpts,
      temperature: 0.3,
      maxTokens: Math.floor((genOpts.maxTokens ?? 4000) * 0.8),
    },
  )
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
): Promise<GenerateResult> {
  if (options.provider === 'ANTHROPIC_COMPAT') {
    throw new Error('图片分析仅支持 OpenAI 兼容模式，请在设置中切换 provider 后重试')
  }

  if (!imageUrls.length) {
    throw new Error('至少需要 1 张图片')
  }

  const messageContent: any[] = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({
      type: 'image_url',
      image_url: { url },
    })),
  ]

  const body = {
    model: options.model,
    messages: [{ role: 'user', content: messageContent }],
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
  const content = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  const usage = data.usage
    ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      }
    : null

  return { content, usage }
}
