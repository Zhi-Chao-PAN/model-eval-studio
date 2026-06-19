import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id, modelId } = await params

  const model = await prisma.taskModel.findFirst({
    where: {
      id: modelId,
      task: {
        id,
        userId: session.userId,
        status: { not: 'DELETED' },
      },
    },
    select: { id: true },
  })
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

  await prisma.taskModel.delete({ where: { id: modelId } })
  return NextResponse.json({ ok: true })
}
