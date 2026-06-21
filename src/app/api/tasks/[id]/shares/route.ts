import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import { getTaskAccess, generateShareToken } from '@/lib/task-access'

// 列出任务的共享链接
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)
  if (access !== 'OWNER') {
    return apiError('只有任务创建者可以管理共享链接', 403)
  }

  const shares = await prisma.taskShare.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ shares })
}

// 创建共享链接
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)
  if (access !== 'OWNER') {
    return apiError('只有任务创建者可以创建共享链接', 403)
  }

  try {
    const body = await request.json()
    const { accessType = 'VIEW', expiresInDays } = body || {}

    if (accessType !== 'VIEW') {
      return apiError('仅支持 VIEW 类型的共享链接', 400)
    }

    let expiresAt: Date | null = null
    if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
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
    })

    return NextResponse.json({ share })
  } catch (err) {
    return apiError('创建共享链接失败：' + errorMessage(err), 500)
  }
}
