import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

// 列出该任务的所有待测模型
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const models = await prisma.taskModel.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      artifacts: { orderBy: { createdAt: 'asc' } },
      reports: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  return NextResponse.json({ models })
}

// 创建/批量添加模型
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params
  const { modelCodes } = await request.json()

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  if (!Array.isArray(modelCodes) || modelCodes.length === 0) {
    return NextResponse.json({ error: 'modelCodes 必须是非空数组' }, { status: 400 })
  }

  const normalizedCodes = [...new Set(
    modelCodes
      .map((code) => String(code).trim().toUpperCase())
      .filter(Boolean),
  )]
  if (normalizedCodes.length === 0) {
    return NextResponse.json({ error: 'modelCodes 必须包含有效模型代号' }, { status: 400 })
  }

  const existing = await prisma.taskModel.findMany({
    where: { taskId: id, modelCode: { in: normalizedCodes } },
    select: { modelCode: true },
  })
  const existingCodes = new Set(existing.map((model) => model.modelCode.toUpperCase()))
  const created = []
  for (const code of normalizedCodes) {
    if (existingCodes.has(code)) continue
    const m = await prisma.taskModel.create({
      data: { taskId: id, modelCode: code, displayName: code },
    })
    created.push(m)
  }

  return NextResponse.json({ models: created, skipped: [...existingCodes] })
}

// 写入对话消息
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params
  const { modelId, displayName, hardMetricsJson, processText, screenshotUrls, verificationScreenshotUrls } = await request.json()

  if (!modelId) return NextResponse.json({ error: 'modelId 必填' }, { status: 400 })

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id, status: { not: 'DELETED' } } },
  })
  if (!model) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const data: any = {}
  if (displayName !== undefined) data.displayName = displayName
  if (hardMetricsJson !== undefined) data.hardMetricsJson = hardMetricsJson
  if (processText !== undefined) data.processText = processText
  if (screenshotUrls !== undefined) data.screenshotUrls = screenshotUrls
  if (verificationScreenshotUrls !== undefined) data.verificationScreenshotUrls = verificationScreenshotUrls

  const updated = await prisma.taskModel.update({ where: { id: modelId }, data })
  return NextResponse.json({ model: updated })
}
