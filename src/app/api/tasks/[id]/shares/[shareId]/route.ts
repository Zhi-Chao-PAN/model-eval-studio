import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError } from '@/lib/api-error'
import { getTaskAccess } from '@/lib/task-access'

// 吊销共享链接
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id, shareId } = await params

  const { access } = await getTaskAccess(id, session)
  if (!access) return apiError('任务不存在', 404)
  if (access !== 'OWNER') {
    return apiError('只有任务创建者可以吊销共享链接', 403)
  }

  const share = await prisma.taskShare.findFirst({
    where: { id: shareId, taskId: id },
  })
  if (!share) {
    return apiError('共享链接不存在', 404)
  }

  await prisma.taskShare.delete({
    where: { id: shareId },
  })

  return NextResponse.json({ success: true })
}
