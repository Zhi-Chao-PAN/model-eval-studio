import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'

export async function GET(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') || '20')))

  const userId = searchParams.get('userId') || undefined
  const action = searchParams.get('action') || undefined
  const status = searchParams.get('status') || undefined
  const fromStr = searchParams.get('from') || undefined
  const toStr = searchParams.get('to') || undefined

  const where: any = {}
  if (userId) where.userId = userId
  if (action) where.action = action
  if (status) where.status = status
  if (fromStr || toStr) {
    where.createdAt = {}
    if (fromStr) where.createdAt.gte = new Date(fromStr)
    if (toStr) where.createdAt.lte = new Date(toStr)
  }

  const skip = (page - 1) * pageSize

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        user: { select: { username: true, role: true } },
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
}
