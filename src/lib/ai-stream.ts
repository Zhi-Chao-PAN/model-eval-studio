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

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'usage'; usage: StreamUsage }

/**
 * Streams chat completion as chunks.
 *
 * Yields `{ type: 'delta', content }` for each text piece, and a final
 * `{ type: 'usage', usage }` chunk if the provider returns usage data.
 */
export async function* streamChat(
  messages: StreamMessage[],
  options: StreamOptions,
): AsyncGenerator<StreamChunk, void, unknown> {
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
): AsyncGenerator<StreamChunk, void, unknown> {
  const openai = new OpenAI({
    baseURL: options.baseUrl,
    apiKey: options.apiKey,
  })

  const stream = (await openai.chat.completions.create({
    model: options.model,
    messages: messages as any,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  } as any)) as any

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) yield { type: 'delta', content: delta }

    // Some providers include usage on the final chunk
    if ((chunk as any).usage) {
      const u = (chunk as any).usage
      yield {
        type: 'usage',
        usage: {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          totalTokens: u.total_tokens ?? 0,
        },
      }
    }
  }
}

async function* streamAnthropic(
  messages: StreamMessage[],
  options: { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number },
): AsyncGenerator<StreamChunk, void, unknown> {
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

  let inputTokens = 0
  let outputTokens = 0

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
        const type = parsed.type

        // Content block delta
        if (type === 'content_block_delta') {
          const delta = parsed.delta?.text
          if (delta) yield { type: 'delta', content: delta }
        }

        // Message start - contains input tokens
        if (type === 'message_start' && parsed.message?.usage) {
          inputTokens = parsed.message.usage.input_tokens ?? 0
        }

        // Message delta - contains output tokens
        if (type === 'message_delta' && parsed.usage) {
          outputTokens = parsed.usage.output_tokens ?? 0
        }

        // Message stop - emit final usage
        if (type === 'message_stop') {
          yield {
            type: 'usage',
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}
