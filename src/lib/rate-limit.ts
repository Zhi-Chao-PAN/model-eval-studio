import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
  resetAt: Date
}

interface RateLimitOptions {
  scope: string
  identifier: string
  limit: number
  windowMs: number
}

interface RateLimitRow {
  count: number
  expiresAt: Date
}

export function getRequestIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

export function rateLimitBucketId(scope: string, identifier: string): string {
  const digest = createHash('sha256')
    .update(`${scope}:${identifier}`)
    .digest('hex')
    .slice(0, 40)
  return `${scope}:${digest}`
}

export async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.windowMs < 1_000) {
    throw new Error('限流配置无效')
  }

  const now = new Date()
  const nextExpiry = new Date(now.getTime() + options.windowMs)
  const id = rateLimitBucketId(options.scope, options.identifier)
  const rows = await prisma.$queryRaw<RateLimitRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("id", "count", "windowStart", "expiresAt", "updatedAt")
    VALUES (${id}, 1, ${now}, ${nextExpiry}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now}
        ELSE "RateLimitBucket"."windowStart"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${nextExpiry}
        ELSE "RateLimitBucket"."expiresAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count", "expiresAt"
  `)

  const row = rows[0]
  if (!row) throw new Error('限流状态写入失败')
  const retryAfterSeconds = Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1_000))

  return {
    allowed: row.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - row.count),
    retryAfterSeconds,
    resetAt: row.expiresAt,
  }
}

export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(JSON.stringify({
    error: `请求过于频繁，请在 ${result.retryAfterSeconds} 秒后重试`,
    retryAfterSeconds: result.retryAfterSeconds,
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(result.retryAfterSeconds),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': result.resetAt.toISOString(),
    },
  })
}
