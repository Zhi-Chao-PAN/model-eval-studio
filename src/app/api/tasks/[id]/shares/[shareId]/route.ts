import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getTaskAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// 撤销分享链接
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    // Rate limit share revocation
    const rl = await consumeRateLimit({
      scope: 'share-revoke',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, shareId } = await params

    const { access } = await getTaskAccess(id, session)
    if (access !== 'OWNER') return NextResponse.json({ error: '只有任务创建者可以撤销分享' }, { status: 403 })

    const share = await prisma.taskShare.findFirst({
      where: { id: shareId, taskId: id },
    })
    if (!share) return NextResponse.json({ error: '分享链接不存在' }, { status: 404 })

    await prisma.taskShare.delete({ where: { id: shareId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    const { message } = safeServerError(err, 'share-revoke')
    return NextResponse.json({ error: '撤销分享失败：' + message }, { status: 500 })
  }
}
