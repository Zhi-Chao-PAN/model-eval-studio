import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'

// 惰性清理：已完成超过 30 天的任务自动硬删除（含关联 blob）
// 每次列表请求最多清理 5 个，失败不影响主流程
async function cleanupExpiredCompletedTasks(userId: string) {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const expired = await prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        updatedAt: { lt: cutoff },
      },
      take: 5,
      include: {
        models: {
          include: {
            artifacts: { select: { url: true } },
          },
        },
      },
    })
    if (expired.length === 0) return

    for (const task of expired) {
      // 清理所有 blob 文件
      const urls: string[] = []
      for (const m of task.models) {
        for (const a of m.artifacts) {
          if (a.url) urls.push(a.url)
        }
      }
      if (urls.length > 0) {
        await Promise.all(
          urls.map((url) =>
            deleteArtifactFile(url).catch(() => undefined),
          ),
        )
      }
      // 硬删除任务（级联删除所有关联数据）
      await prisma.task.delete({ where: { id: task.id } })
    }
  } catch (err) {
    // 清理失败不影响主流程，仅记录
    console.warn('过期任务清理失败:', err instanceof Error ? err.message : String(err))
  }
}

// 获取当前用户的任务列表
export async function GET() {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // 惰性清理 30 天前的已完成任务
  void cleanupExpiredCompletedTasks(session.userId)

  const tasks = await prisma.task.findMany({
    where: {
      userId: session.userId,
      status: { not: 'DELETED' },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      category: true,
      requirementType: true,
      status: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { models: true } },
    },
  })

  return NextResponse.json({ tasks })
}

// 创建新任务
export async function POST(request: Request) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskId: string | null = null
  let title = ''

  try {
    const body = await request.json()
    title = body.title || ''
    const { category, requirementType, requirementName, description } = body

    if (!title) {
      errorMsg = '任务名称必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    // 获取用户背景作为默认
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { background: true },
    })

    const task = await prisma.task.create({
      data: {
        userId: session.userId,
        title,
        category,
        requirementType,
        requirementName,
        description,
        backgroundUsed: user?.background || '',
        status: 'DRAFT',
        currentStep: 'DESIGN',
      },
    })

    taskId = task.id
    status = 'success'
    return NextResponse.json({ task })
  } finally {
    logAudit(request, {
      action: 'TASK_CREATE',
      userId: session.userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { title },
    })
  }
}
