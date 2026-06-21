import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id, modelId } = await params

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
      select: {
        id: true,
        verificationScreenshotUrls: true,
      },
    })

    if (!model) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 })
    }

    return NextResponse.json({
      verificationScreenshotUrls: model.verificationScreenshotUrls,
    })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: '获取验证截图失败：' + errorMsg }, { status: 500 })
  }
}
