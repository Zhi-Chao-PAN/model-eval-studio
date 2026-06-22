import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'
import { AuditAction } from '@prisma/client'

const VALID_ACTIONS = new Set<string>(Object.values(AuditAction))

// Audit status is free-form string ('success', 'error', 'queued', etc.) so we
// only validate length to prevent absurdly long inputs from hitting the DB.
const MAX_STATUS_LENGTH = 32

export async function GET(request: Request) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    if (session.role !== 'ADMIN') return NextResponse.json({ error: '权限不足' }, { status: 403 })

    // Rate limit admin queries to prevent scraping
    const rl = await consumeRateLimit({
      scope: 'admin-audit-logs',
      identifier: session.userId,
      limit: 60,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { searchParams } = new URL(request.url)
    const pageRaw = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '50', 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 200 ? Math.floor(pageSizeRaw) : 50

    const userId = searchParams.get('userId')
    const action = searchParams.get('action')
    const taskId = searchParams.get('taskId')
    const status = searchParams.get('status')
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')

    // Validate CUID-format params to prevent DB errors from malformed inputs
    if (userId && !isValidCuid(userId)) {
      return NextResponse.json({ error: 'userId 参数格式无效' }, { status: 400 })
    }
    if (taskId && !isValidCuid(taskId)) {
      return NextResponse.json({ error: 'taskId 参数格式无效' }, { status: 400 })
    }
    if (action && !VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'action 参数无效' }, { status: 400 })
    }
    if (status && (status.length > MAX_STATUS_LENGTH || /[^\w-]/.test(status))) {
      return NextResponse.json({ error: 'status 参数无效' }, { status: 400 })
    }

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (action) where.action = action
    if (taskId) where.taskId = taskId
    if (status) where.status = status

    if (fromStr) {
      const from = new Date(fromStr)
      if (!Number.isNaN(from.getTime())) {
        where.createdAt = { ...(where.createdAt as object || {}), gte: from }
      }
    }
    if (toStr) {
      const to = new Date(toStr)
      if (!Number.isNaN(to.getTime())) {
        where.createdAt = { ...(where.createdAt as object || {}), lte: to }
      }
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true } },
        },
      }),
    ])

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-audit-logs')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
