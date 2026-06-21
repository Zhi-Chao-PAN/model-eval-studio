import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

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
    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true, modelCode: true, artifacts: { select: { url: true } } },
    })
    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    // 先删除所有关联的 blob 文件（失败不阻断模型删除，仅记录警告）
    if (model.artifacts.length > 0) {
      await Promise.all(
        model.artifacts.map((a) =>
          deleteArtifactFile(a.url).catch((err) => {
            console.warn('清理模型产物文件失败:', a.url, err instanceof Error ? err.message : String(err))
          }),
        ),
      )
    }

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
