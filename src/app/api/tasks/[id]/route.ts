import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params

  const task = await prisma.task.findFirst({
    where: {
      id,
      userId: session.userId,
      status: { not: 'DELETED' },
    },
    include: {
      attachments: { orderBy: { createdAt: 'asc' } },
      models: {
        orderBy: { createdAt: 'asc' },
        include: {
          artifacts: { orderBy: { createdAt: 'asc' } },
          reports: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
    },
  })

  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  }

  return NextResponse.json({ task })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let updatedFields: string[] = []

  try {
    const data = await request.json()

    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const allowed = [
      'title', 'category', 'requirementType', 'requirementName',
      'description', 'backgroundUsed', 'currentStep', 'status',
      'taskIdeaJson', 'analysisJson',
    ]

    const updateData: any = {}
    for (const key of allowed) {
      if (key in data) {
        updateData[key] = data[key]
        updatedFields.push(key)
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    })

    status = 'success'
    return NextResponse.json({ task: updated })
  } finally {
    logAudit(request, {
      action: 'TASK_UPDATE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { updatedFields },
    })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskTitle = ''

  try {
    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    taskTitle = task.title
    await prisma.task.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedBy: session.userId,
      },
    })

    status = 'success'
    return NextResponse.json({ ok: true })
  } finally {
    logAudit(request, {
      action: 'TASK_DELETE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { title: taskTitle },
    })
  }
}
