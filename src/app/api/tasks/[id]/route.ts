import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

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
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params
  const data = await request.json()

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId },
  })
  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
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
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ task: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId },
  })
  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  }

  await prisma.task.update({
    where: { id },
    data: {
      status: 'DELETED',
      deletedAt: new Date(),
      deletedBy: session.userId,
    },
  })

  return NextResponse.json({ ok: true })
}