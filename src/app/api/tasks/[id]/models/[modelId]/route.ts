import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelCode = ''
  let sessionUserId = ''
  let taskId = ''

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    sessionUserId = session.userId

    // Rate limit model deletion
    const rl = await consumeRateLimit({
      scope: 'model-delete',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) {
      return NextResponse.json({ error: '参数格式无效' }, { status: 400 })
    }
    taskId = id

    const { access } = await getTaskAccess(id, session)
    if (access !== 'OWNER') {
      errorMsg = '只有任务创建者可以删除模型'
      return NextResponse.json({ error: errorMsg }, { status: 403 })
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
  } catch (err) {
    const { message } = safeServerError(err, 'model-delete')
    errorMsg = message
    return NextResponse.json({ error: '删除模型失败：' + message }, { status: 500 })
  } finally {
    if (sessionUserId) {
      logAudit(request, {
        action: 'MODEL_DELETE',
        userId: sessionUserId,
        taskId,
        status,
        error: errorMsg,
        durationMs: Date.now() - startedAt,
        detail: { modelCode },
      })
    }
  }
}
