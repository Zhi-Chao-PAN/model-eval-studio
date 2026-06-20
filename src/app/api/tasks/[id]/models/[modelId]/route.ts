import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id, modelId } = await params
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelCode = ''

  try {
    const model = await prisma.taskModel.findFirst({
      where: {
        id: modelId,
        task: {
          id,
          userId: session.userId,
          status: { not: 'DELETED' },
        },
      },
      select: { id: true, modelCode: true },
    })
    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    await prisma.taskModel.delete({ where: { id: modelId } })
    status = 'success'
    return NextResponse.json({ ok: true })
  } finally {
    logAudit(request, {
      action: 'MODEL_DELETE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelCode },
    })
  }
}
