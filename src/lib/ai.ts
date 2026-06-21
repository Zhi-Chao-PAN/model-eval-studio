import OpenAI from 'openai'
import { type AiProvider } from '@prisma/client'
import { openAiChatCompletionsUrl } from '@/lib/ai-endpoint'

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
  timeoutMs?: number
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
  const { baseUrl, apiKey, model, provider, temperature = 0.7, maxTokens = 4000, timeoutMs = 60_000 } = options

  if (provider === 'ANTHROPIC_COMPAT') {
    return generateChatAnthropic(messages, { baseUrl, apiKey, model, temperature, maxTokens, timeoutMs })
  }

  return generateChatOpenai(messages, { baseUrl, apiKey, model, temperature, maxTokens, timeoutMs })
}

async function generateChatOpenai(
  messages: AiMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number; timeoutMs: number }
): Promise<GenerateResult> {
  const openai = new OpenAI({
    baseURL: options.baseUrl,
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
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
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number; timeoutMs: number }
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
    signal: AbortSignal.timeout(options.timeoutMs),
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

  const url = openAiChatCompletionsUrl(options.baseUrl)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
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

/**
 * 对上游 AI 错误做脱敏、分类和截断，返回安全的用户可读消息。
 *
 * 规则：
 * - 根据 HTTP 状态码分类错误（鉴权、限流、超时、上游异常等）
 * - 自动剥离错误消息中的 API Key / Authorization 等敏感信息
 * - 截断上游详细消息到 200 字符以内，避免溢出
 * - 开发环境下保留原始错误（作为 raw 字段），生产环境只返回脱敏摘要
 */
export interface SanitizedAiError {
  message: string        // 面向用户的中文错误消息
  category:              // 错误分类，供前端做不同处理
    | 'auth'             // 鉴权失败：API Key 无效
    | 'not_found'        // 模型或 Base URL 错误
    | 'rate_limit'       // 触发限流
    | 'timeout'          // 请求超时
    | 'upstream_5xx'     // 上游服务端错误
    | 'content_filter'   // 内容安全/合规拦截
    | 'context_length'   // 上下文长度超限
    | 'unknown'          // 其他错误
  status?: number
  raw?: string           // 原始错误（仅开发环境）
}

const AI_ERROR_MAX_DETAIL_LENGTH = 200

export function sanitizeAiError(err: unknown): SanitizedAiError {
  const isDev = process.env.NODE_ENV !== 'production'
  const raw = err instanceof Error ? err.message : String(err)

  // 尝试从错误消息中提取 HTTP 状态码
  const statusMatch = raw.match(/HTTP\s*(\d{3})/i)
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined

  // 超时类错误
  if (
    /timeout|timed out|ETIMEDOUT|ECONNRESET|AbortError|网络超时/i.test(raw) ||
    (err instanceof DOMException && err.name === 'TimeoutError')
  ) {
    return {
      message: 'AI 服务响应超时，请稍后重试或检查网络连接',
      category: 'timeout',
      status,
      raw: isDev ? raw : undefined,
    }
  }

  if (status) {
    // 鉴权失败
    if (status === 401 || status === 403) {
      return {
        message: 'API Key 无效或无权限访问该模型，请检查设置',
        category: 'auth',
        status,
        raw: isDev ? raw : undefined,
      }
    }

    // 模型 / URL 不存在
    if (status === 404) {
      return {
        message: '模型名称或 Base URL 错误，请检查设置',
        category: 'not_found',
        status,
        raw: isDev ? raw : undefined,
      }
    }

    // 限流
    if (status === 429) {
      return {
        message: 'AI 服务触发限流，请稍后重试',
        category: 'rate_limit',
        status,
        raw: isDev ? raw : undefined,
      }
    }

    // 上游 5xx
    if (status >= 500) {
      return {
        message: 'AI 服务端暂时不可用，请稍后重试',
        category: 'upstream_5xx',
        status,
        raw: isDev ? raw : undefined,
      }
    }
  }

  // 内容安全拦截（关键词匹配）
  if (/content.*filter|content_policy|安全过滤|内容审核|sensitive|inappropriate/i.test(raw)) {
    return {
      message: '请求内容可能违反安全策略，请调整提示词后重试',
      category: 'content_filter',
      status,
      raw: isDev ? raw : undefined,
    }
  }

  // 上下文长度超限
  if (/context.*length|max.*tokens|token.*limit|上下文.*超长|长度.*超限/i.test(raw)) {
    return {
      message: '输入内容过长，超出模型上下文长度限制，请减少输入内容',
      category: 'context_length',
      status,
      raw: isDev ? raw : undefined,
    }
  }

  // 通用错误：剥离敏感信息，截断后返回
  const sanitized = raw
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/api[_-]?key['":\s]*[A-Za-z0-9_-]{16,}/gi, 'apiKey: ***')

  const truncated = sanitized.length > AI_ERROR_MAX_DETAIL_LENGTH
    ? sanitized.slice(0, AI_ERROR_MAX_DETAIL_LENGTH) + '…'
    : sanitized

  return {
    message: `AI 调用失败：${truncated || '未知错误'}`,
    category: 'unknown',
    status,
    raw: isDev ? raw : undefined,
  }
}
