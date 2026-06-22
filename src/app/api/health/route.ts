import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * 轻量健康检查端点。
 *
 * 用途：
 * - Vercel / 监控平台 uptime probe（无需鉴权）
 * - 部署后冒烟测试（验证 DB 连通性 + Prisma Client 可用）
 *
 * 不返回任何敏感信息（无用户/任务/密钥）。
 */
export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbError: string | null = null

  try {
    // $executeRaw 或 $queryRaw 做最小 SELECT 1 连通性检查
    await prisma.$executeRaw(Prisma.sql`SELECT 1`)
    dbOk = true
  } catch (err: unknown) {
    // In production, do NOT leak internal error details (hostnames, connection strings, etc.)
    if (process.env.NODE_ENV === 'production') {
      dbError = 'connection failed'
    } else {
      dbError = err instanceof Error ? String(err.message).slice(0, 200) : 'unknown'
    }
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    service: 'model-eval-studio',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'connected' : 'error',
    responseTimeMs: Date.now() - startedAt,
    ...(dbError ? { dbError } : {}),
  }

  return NextResponse.json(body, { status: dbOk ? 200 : 503 })
}
