import OpenAI from 'openai'
import { type AiProvider } from '@prisma/client'

export interface StreamMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamOptions {
  baseUrl: string
  apiKey: string
  model: string
  provider: AiProvider
  temperature?: number
  maxTokens?: number
}

/**
 * Streams chat completion as text deltas.
 * Returns an async iterable of string chunks; caller is responsible for accumulating.
 */
export async function* streamChat(
  messages: StreamMessage[],
  options: StreamOptions,
): AsyncGenerator<string, void, unknown> {
  const { baseUrl, apiKey, model, provider, temperature = 0.7, maxTokens = 4000 } = options

  if (provider === 'ANTHROPIC_COMPAT') {
    yield* streamAnthropic(messages, { baseUrl, apiKey, model, temperature, maxTokens })
    return
  }

  yield* streamOpenAI(messages, { baseUrl, apiKey, model, temperature, maxTokens })
}

async function* streamOpenAI(
  messages: StreamMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number },
): AsyncGenerator<string, void, unknown> {
  const openai = new OpenAI({
    baseURL: options.baseUrl,
    apiKey: options.apiKey,
  })

  const stream = await openai.chat.completions.create({
    model: options.model,
    messages: messages as any,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    stream: true,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) yield delta
  }
}

async function* streamAnthropic(
  messages: StreamMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number },
): AsyncGenerator<string, void, unknown> {
  const systemMsgs = messages.filter((m) => m.role === 'system').map((m) => m.content)
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system')

  const body: any = {
    model: options.model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    messages: nonSystemMsgs.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
    stream: true,
  }
  if (systemMsgs.length > 0) body.system = systemMsgs.join('\n\n')

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
    const err = await res.text()
    throw new Error(`Anthropic streaming error: ${res.status} ${err}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data) continue
      try {
        const parsed = JSON.parse(data)
        const delta = parsed?.delta?.text
        if (delta) yield delta
      } catch {
        // ignore parse errors
      }
    }
  }
}