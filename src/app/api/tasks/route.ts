import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// 获取当前用户的任务列表
export async function GET() {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const tasks = await prisma.task.findMany({
    where: {
      userId: session.userId,
      status: { not: 'DELETED' },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      category: true,
      requirementType: true,
      status: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { models: true } },
    },
  })

  return NextResponse.json({ tasks })
}

// 创建新任务
export async function POST(request: Request) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskId: string | null = null
  let title = ''

  try {
    const body = await request.json()
    title = body.title || ''
    const { category, requirementType, requirementName, description } = body

    if (!title) {
      errorMsg = '任务名称必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 获取用户背景作为默认
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { background: true },
    })

    const task = await prisma.task.create({
      data: {
        userId: session.userId,
        title,
        category,
        requirementType,
        requirementName,
        description,
        backgroundUsed: user?.background || '',
        status: 'DRAFT',
        currentStep: 'DESIGN',
      },
    })

    taskId = task.id
    status = 'success'
    return NextResponse.json({ task })
  } finally {
    logAudit(request, {
      action: 'TASK_CREATE',
      userId: session.userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { title },
    })
  }
}
