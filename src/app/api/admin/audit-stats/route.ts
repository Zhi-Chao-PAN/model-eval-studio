import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

    // Rate limit admin queries
    const rl = await consumeRateLimit({
      scope: 'admin-stats',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const [totalUsers, totalTasks, totalModels, totalReports, recentLogs] = await Promise.all([
      prisma.user.count(),
      prisma.task.count(),
      prisma.taskModel.count(),
      prisma.modelReport.count(),
      prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { username: true } } },
      }),
    ])

    return NextResponse.json({
      stats: {
        totalUsers,
        totalTasks,
        totalModels,
        totalReports,
      },
      recentLogs,
    })
  } catch (err) {
    const { message } = safeServerError(err, 'admin-stats')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
