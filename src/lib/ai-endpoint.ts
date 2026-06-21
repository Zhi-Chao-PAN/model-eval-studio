import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { AiProvider } from '@prisma/client'

const ALLOWED_PROVIDERS = new Set<AiProvider>(['OPENAI_COMPAT', 'ANTHROPIC_COMPAT'])

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mapped ? isPrivateIpv4(mapped[1]) : false
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return true
}

export function normalizeAiBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('AI Base URL 必填')

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('AI Base URL 不是有效网址')
  }

  const allowHttp = process.env.NODE_ENV !== 'production'
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('AI Base URL 必须使用 HTTPS')
  }
  if (url.username || url.password) throw new Error('AI Base URL 不能包含用户名或密码')
  if (url.search || url.hash) throw new Error('AI Base URL 不能包含查询参数或片段')

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    if (process.env.NODE_ENV === 'production') throw new Error('AI Base URL 不能指向本机或内部网络')
  }

  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export async function assertSafeAiBaseUrl(value: unknown): Promise<string> {
  const normalized = normalizeAiBaseUrl(value)
  const hostname = new URL(normalized).hostname

  if (process.env.NODE_ENV !== 'production' && (hostname === 'localhost' || hostname.endsWith('.localhost'))) {
    return normalized
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new Error('AI Base URL 域名无法解析')
  }
  if (addresses.length === 0 || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('AI Base URL 不能指向本机、内网或保留地址')
  }
  return normalized
}

export function parseAiProvider(value: unknown): AiProvider {
  if (typeof value !== 'string' || !ALLOWED_PROVIDERS.has(value as AiProvider)) {
    throw new Error('不支持的 AI Provider')
  }
  return value as AiProvider
}

export function parseAiMaxTokens(value: unknown, fallback = 4000): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 256 || parsed > 128_000) {
    throw new Error('最大输出 Token 必须是 256 到 128000 之间的整数')
  }
  return parsed
}

export function openAiChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`
}
