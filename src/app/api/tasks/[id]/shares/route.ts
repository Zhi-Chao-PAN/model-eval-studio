import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { getTaskAccess, generateShareToken } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const MAX_SHARES_PER_TASK = 50
const MAX_EXPIRES_DAYS = 365
const MIN_EXPIRES_DAYS = 1

// 列出任务的共享链接
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id } = await params

    const { access } = await getTaskAccess(id, session)
    if (!access) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    if (access !== 'OWNER') {
      return NextResponse.json({ error: '只有任务创建者可以管理共享链接' }, { status: 403 })
    }

    const shares = await prisma.taskShare.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        accessType: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ shares })
  } catch (err) {
    const { message } = safeServerError(err, 'shares-list')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 创建共享链接
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (access !== 'OWNER') {
    return NextResponse.json({ error: '只有任务创建者可以创建共享链接' }, { status: 403 })
  }

  const rl = await consumeRateLimit({
    scope: 'share-create',
    identifier: session.userId,
    limit: 30,
    windowMs: 60 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const { accessType = 'VIEW', expiresInDays } = body as {
      accessType?: unknown
      expiresInDays?: unknown
    }

    if (typeof accessType !== 'string' || accessType !== 'VIEW') {
      return NextResponse.json({ error: '仅支持 VIEW 类型的共享链接' }, { status: 400 })
    }

    let expiresAt: Date | null = null
    if (expiresInDays !== undefined && expiresInDays !== null) {
      if (typeof expiresInDays !== 'number' || !Number.isFinite(expiresInDays)) {
        return NextResponse.json({ error: 'expiresInDays 必须为数字' }, { status: 400 })
      }
      const days = Math.round(expiresInDays)
      if (days < MIN_EXPIRES_DAYS || days > MAX_EXPIRES_DAYS) {
        return NextResponse.json(
          { error: `过期天数需为 ${MIN_EXPIRES_DAYS}-${MAX_EXPIRES_DAYS} 天` },
          { status: 400 },
        )
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }

    // Cap total shares per task to prevent token flooding
    const existingCount = await prisma.taskShare.count({ where: { taskId: id } })
    if (existingCount >= MAX_SHARES_PER_TASK) {
      return NextResponse.json(
        { error: `每个任务最多 ${MAX_SHARES_PER_TASK} 个共享链接，请先吊销旧链接` },
        { status: 400 },
      )
    }

    const token = generateShareToken()

    const share = await prisma.taskShare.create({
      data: {
        taskId: id,
        token,
        accessType,
        expiresAt,
        createdById: session.userId,
      },
      select: {
        id: true,
        token: true,
        accessType: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ share })
  } catch (err) {
    const { status, message } = safeServerError(err, 'share-create')
    return NextResponse.json({ error: '创建共享链接失败：' + message }, { status })
  }
}
