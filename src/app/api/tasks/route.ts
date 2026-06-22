import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'
import { clampDbText } from '@/lib/utils'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

// 允许的分类 / 任务类型枚举（与前端枚举保持一致）
const ALLOWED_CATEGORIES = new Set(['PRODUCT', 'CODING', 'DESIGN', 'RESEARCH', 'OTHER'])
const ALLOWED_REQUIREMENT_TYPES = new Set(['CODING', 'AGENT'])
const TITLE_MAX = 100
const DESCRIPTION_MAX = 5_000
const REQUIREMENT_NAME_MAX = 200

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

// 获取当前用户的任务列表（含我创建的 + 与我共享的）
export async function GET() {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 惰性清理 30 天前的已完成任务
    void cleanupExpiredCompletedTasks(session.userId)

    const taskSelect = {
      id: true,
      title: true,
      category: true,
      requirementType: true,
      status: true,
      currentStep: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { models: true } },
    } as const

    // 我创建的任务
    const myTasks = await prisma.task.findMany({
      where: {
        userId: session.userId,
        status: { not: 'DELETED' },
      },
      orderBy: { updatedAt: 'desc' },
      select: taskSelect,
    })

    // 与我共享的任务
    const sharedRows = await prisma.taskCollaborator.findMany({
      where: {
        userId: session.userId,
        task: { status: { not: 'DELETED' } },
      },
      orderBy: { task: { updatedAt: 'desc' } },
      include: {
        task: {
          select: {
            ...taskSelect,
            user: { select: { username: true } },
          },
        },
      },
    })

    const sharedTasks = sharedRows
      .filter(row => row.task)
      .map(row => ({
        ...row.task,
        role: row.role,
      }))

    return NextResponse.json({ tasks: myTasks, sharedTasks })
  } catch (err) {
    const { message } = safeServerError(err, 'task-list')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 创建新任务
export async function POST(request: Request) {
  const startedAt = Date.now()

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskId: string | null = null
  let safeTitle = ''
  let sessionUserId = ''

  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    sessionUserId = session.userId

    // Rate limit task creation to prevent abuse
    const rl = await consumeRateLimit({
      scope: 'task-create',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rawTitle = ((body as Record<string, unknown>).title ?? '').toString().trim()
    const { category: cat, requirementType: rt, requirementName: rn } = body as Record<string, unknown>
    let { description: desc } = body as Record<string, unknown>

    if (!rawTitle) {
      errorMsg = '任务名称必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    safeTitle = clampDbText(rawTitle, TITLE_MAX)!
    if (cat != null && !ALLOWED_CATEGORIES.has(String(cat))) {
      errorMsg = 'category 非法，允许值：' + [...ALLOWED_CATEGORIES].join('/')
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (rt != null && !ALLOWED_REQUIREMENT_TYPES.has(String(rt))) {
      errorMsg = 'requirementType 非法，允许值：CODING/AGENT'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    let safeDescription: string | null = null
    if (desc != null) {
      safeDescription = clampDbText(desc == null ? null : String(desc), DESCRIPTION_MAX) ?? null
    }
    const safeCategory = cat != null ? String(cat) : undefined
    const safeRequirementType = rt != null ? String(rt) : undefined
    const safeRequirementName = rn == null
      ? undefined
      : (clampDbText(String(rn), REQUIREMENT_NAME_MAX) ?? undefined)

    // 获取用户背景作为默认
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { background: true },
    })

    const task = await prisma.task.create({
      data: {
        userId: session.userId,
        title: safeTitle,
        category: safeCategory,
        requirementType: safeRequirementType,
        requirementName: safeRequirementName,
        description: safeDescription ?? undefined,
        backgroundUsed: user?.background || '',
        status: 'DRAFT',
        currentStep: 'DESIGN',
      },
    })

    taskId = task.id
    status = 'success'
    return NextResponse.json({ task })
  } catch (err) {
    const { message } = safeServerError(err, 'task-create')
    errorMsg = message
    return NextResponse.json({ error: '创建任务失败：' + message }, { status: 500 })
  } finally {
    if (sessionUserId) {
      logAudit(request, {
        action: 'TASK_CREATE',
        userId: sessionUserId,
        taskId,
        status,
        error: errorMsg,
        durationMs: Date.now() - startedAt,
        detail: { title: safeTitle },
      })
    }
  }
}
