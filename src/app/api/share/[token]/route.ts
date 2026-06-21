import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-error'

// 通过公开链接获取任务信息（只读，无需登录）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const share = await prisma.taskShare.findUnique({
    where: { token },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          backgroundUsed: true,
          category: true,
          status: true,
          currentStep: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { username: true },
          },
          models: {
            select: {
              id: true,
              modelCode: true,
              displayName: true,
              hardMetricsJson: true,
              processText: true,
              createdAt: true,
              reports: {
                orderBy: { version: 'desc' },
                take: 1,
              },
              artifacts: {
                select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  })

  if (!share || !share.task || share.task.status === 'DELETED') {
    return apiError('共享链接无效或已过期', 404)
  }

  // 检查是否过期
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return apiError('共享链接已过期', 410)
  }

  return NextResponse.json({
    task: share.task,
    share: {
      id: share.id,
      accessType: share.accessType,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    },
  })
}
