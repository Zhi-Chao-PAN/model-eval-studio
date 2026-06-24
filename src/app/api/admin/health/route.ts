import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { buildHealthSummary, type HealthAuditRecord } from '@/lib/admin-health'

/** AuditAction 枚举里所有 AI_* 前缀的 action。Prisma 不支持对 enum 字段做 startsWith。 */
const AI_ACTIONS: Prisma.EnumAuditActionFilter['in'] = [
  'AI_CHAT',
  'AI_IDEA_GENERATE',
  'AI_SCREENSHOT_ANALYZE',
  'AI_ARTIFACT_ANALYZE',
  'AI_REPORT_GENERATE',
]

/**
 * 管理后台「健康监控」聚合 API。
 *
 * 与 `/api/admin/audit-stats` 的分工：
 * - `audit-stats`：全局 totals + 最近 10 条 log（已有，被 audit tab 使用）
 * - `health` (本路由)：5 个新视角——按 action / 失败分类 / 延迟分布 / 24h 趋势 / 用户排行
 *
 * 数据源：AuditLog（仅 AI_* 前缀 action 入聚合）。
 * 不查 User / Task 等其它表——所有 username 由 AuditLog.user 关联带出。
 * 也不写库、不改 schema、不缓存。
 *
 * Query params:
 *   range: 'today' | '7d' | '30d'（默认 'today'，即 24h）
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

    // Rate limit：与 audit-stats 同档（10 分钟 30 次）
    const rl = await consumeRateLimit({
      scope: 'admin-health',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { searchParams } = new URL(request.url)
    const rangeParam = searchParams.get('range') || 'today'
    const windowParam = searchParams.get('window') // 1h | 24h | 7d | 30d
    const range: 'today' | '7d' | '30d' =
      rangeParam === '7d' || rangeParam === '30d' ? rangeParam : 'today'

    const now = new Date()
    const to = now
    let from: Date
    if (windowParam === '1h') {
      // 1h 用于健康预警；不受 range 参数影响
      from = new Date(now.getTime() - 60 * 60 * 1000)
    } else if (range === 'today') {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    } else if (range === '7d') {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const records = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        action: { in: AI_ACTIONS },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { username: true } },
      },
    })

    const aggregatorInput: HealthAuditRecord[] = records.map(r => ({
      action: r.action as string,
      status: r.status,
      error: r.error,
      durationMs: r.durationMs,
      tokenInput: r.tokenInput,
      tokenOutput: r.tokenOutput,
      createdAt: r.createdAt,
      userId: r.userId,
      user: r.user,
    }))

    const summary = buildHealthSummary(aggregatorInput, from, to, 10)

    return NextResponse.json({
      range,
      window: windowParam === '1h' ? '1h' : '24h-or-range',
      summary,
    })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-health')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
