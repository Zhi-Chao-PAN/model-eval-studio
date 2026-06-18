import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

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
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { title, category, requirementType, requirementName, description } = await request.json()
  if (!title) {
    return NextResponse.json({ error: '任务名称必填' }, { status: 400 })
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
      currentStep: 'INFO',
    },
  })

  return NextResponse.json({ task })
}
