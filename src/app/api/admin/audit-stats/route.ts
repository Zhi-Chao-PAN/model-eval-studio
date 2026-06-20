import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function GET(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const range = searchParams.get('range') || 'today' // today / 7d / 30d

  let fromDate: Date
  const now = new Date()
  if (range === '7d') {
    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (range === '30d') {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  } else {
    // today: start of today in local time
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  const where = { createdAt: { gte: fromDate } }

  const [totalCount, errorCount, tokenSum, activeUsers, aiCount] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, status: 'error' } }),
    prisma.auditLog.aggregate({
      where,
      _sum: { tokenInput: true, tokenOutput: true },
    }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: { ...where, userId: { not: null } },
      _count: { userId: true },
    }),
    prisma.auditLog.count({
      where: {
        ...where,
        action: {
          in: [
            'AI_CHAT', 'AI_IDEA_GENERATE', 'AI_SCREENSHOT_ANALYZE',
            'AI_ARTIFACT_ANALYZE', 'AI_REPORT_GENERATE',
          ],
        },
      },
    }),
  ])

  // fire-and-forget
  logAudit(request, {
    action: 'ADMIN_AUDIT_VIEW',
    userId: session.userId,
    status: 'success',
    detail: { range },
  })

  return NextResponse.json({
    stats: {
      totalCalls: totalCount,
      aiCalls: aiCount,
      errorCalls: errorCount,
      activeUsers: activeUsers.length,
      totalTokenInput: tokenSum._sum.tokenInput ?? 0,
      totalTokenOutput: tokenSum._sum.tokenOutput ?? 0,
      range,
      from: fromDate.toISOString(),
    },
  })
}
