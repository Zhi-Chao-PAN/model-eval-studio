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

  const task = await prisma.task.findFirst({ where: { id, userId: session.userId } })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const messages = await prisma.taskMessage.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ messages })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params
  const { role, content, step, modelId } = await request.json()

  if (!role || !content || !step) {
    return NextResponse.json({ error: 'role / content / step 必填' }, { status: 400 })
  }

  const task = await prisma.task.findFirst({ where: { id, userId: session.userId } })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const msg = await prisma.taskMessage.create({
    data: { taskId: id, role, content, step, modelId },
  })
  return NextResponse.json({ message: msg })
}