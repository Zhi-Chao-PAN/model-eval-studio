import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TaskStep } from '@prisma/client'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'
import { parseTrajectoryScreenshots } from '@/lib/trajectory-screenshots'
import { getTaskAccess, hasAccessLevel, requireAccess } from '@/lib/task-access'
import { clampDbText, isValidCuid } from '@/lib/utils'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

const ALLOWED_CATEGORIES = new Set(['PRODUCT', 'CODING', 'DESIGN', 'RESEARCH', 'OTHER'])
const ALLOWED_REQUIREMENT_TYPES = new Set(['CODING', 'AGENT'])
const ALLOWED_STATUSES = new Set(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'DELETED'])
const ALLOWED_STEPS = new Set<TaskStep>(Object.values(TaskStep))
const ANALYSIS_JSON_MAX = 500_000
const TITLE_MAX = 100
const DESCRIPTION_MAX = 5_000
const REQUIREMENT_NAME_MAX = 200
const BACKGROUND_MAX = 5_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })

    const { access, task: accessTask } = await getTaskAccess(id, session)
    const accessDenied = requireAccess(access, 'VIEWER')
    if (accessDenied) {
      return NextResponse.json({ error: accessDenied.error }, { status: accessDenied.status })
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        models: {
          orderBy: { createdAt: 'asc' },
          include: {
            artifacts: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                name: true,
                size: true,
                createdAt: true,
              },
            },
            reports: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                version: true,
                source: true,
                productFeedback: true,
                overallScore: true,
                overallComment: true,
                efficiencyScore: true,
                efficiencyComment: true,
                qualityScore: true,
                qualityComment: true,
                trajectoryAnalysis: true,
                createdAt: true,
              },
            },
            artifactAnalysisRuns: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                currentPhase: true,
                error: true,
                workflowRunId: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                updatedAt: true,
                nextEventSeq: true,
                events: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    id: true,
                    sequence: true,
                    phase: true,
                    status: true,
                    label: true,
                    detail: true,
                    metadata: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 200,
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    }

    // 懒加载字段不在任务详情中返回，避免 payload 膨胀
    // - screenshotUrls: 轨迹截图 Blob URL 列表，通过 /models/[modelId]/screenshots 按需加载
    // - verificationScreenshotUrls: 验证截图 base64，通过 /models/[modelId]/verification 按需加载
    for (const model of task.models) {
      ;(model as any).screenshotUrls = undefined
      ;(model as any).verificationScreenshotUrls = undefined
    }

    return NextResponse.json({
      task: {
        ...task,
        messages: [...task.messages].reverse(),
      },
    })
  } catch (err) {
    const { message } = safeServerError(err, 'task-detail')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // Rate limit task updates to prevent abuse
  const rl = await consumeRateLimit({
    scope: 'task-update',
    identifier: session.userId,
    limit: 60,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id } = await params
  if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  const updatedFields: string[] = []

  try {
    const data = await request.json().catch(() => null)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const accessDenied = requireAccess(access, 'EDITOR')
    if (accessDenied) {
      errorMsg = accessDenied.error
      return NextResponse.json({ error: errorMsg }, { status: accessDenied.status })
    }

    const task = await prisma.task.findUnique({
      where: { id },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const allowed = [
      'title', 'category', 'requirementType', 'requirementName',
      'description', 'backgroundUsed', 'currentStep', 'status',
      'analysisJson',
    ]

    const updateData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in data) {
        updateData[key] = (data as Record<string, unknown>)[key]
        updatedFields.push(key)
      }
    }

    // 字段校验
    if ('title' in updateData) {
      const t = typeof updateData.title === 'string' ? updateData.title.trim() : ''
      if (!t) {
        errorMsg = '任务名称必填'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      updateData.title = clampDbText(t, TITLE_MAX)
    }
    if ('category' in updateData && updateData.category != null) {
      if (!ALLOWED_CATEGORIES.has(String(updateData.category))) {
        errorMsg = 'category 非法'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
    }
    if ('requirementType' in updateData && updateData.requirementType != null) {
      if (!ALLOWED_REQUIREMENT_TYPES.has(String(updateData.requirementType))) {
        errorMsg = 'requirementType 非法'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
    }
    if ('status' in updateData && updateData.status != null) {
      if (!ALLOWED_STATUSES.has(String(updateData.status))) {
        errorMsg = 'status 非法'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
    }
    if ('description' in updateData && updateData.description != null) {
      updateData.description = clampDbText(String(updateData.description), DESCRIPTION_MAX)
    }
    if ('requirementName' in updateData && updateData.requirementName != null) {
      updateData.requirementName = clampDbText(String(updateData.requirementName), REQUIREMENT_NAME_MAX)
    }
    if ('backgroundUsed' in updateData && updateData.backgroundUsed != null) {
      updateData.backgroundUsed = clampDbText(String(updateData.backgroundUsed), BACKGROUND_MAX)
    }
    if ('currentStep' in updateData && updateData.currentStep != null) {
      const step = String(updateData.currentStep)
      if (!ALLOWED_STEPS.has(step as TaskStep)) {
        errorMsg = 'currentStep 非法'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      updateData.currentStep = step
    }
    if ('analysisJson' in updateData && updateData.analysisJson != null) {
      if (typeof updateData.analysisJson !== 'string') {
        errorMsg = 'analysisJson 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      updateData.analysisJson = clampDbText(updateData.analysisJson, ANALYSIS_JSON_MAX)
    }

    // 状态机：用户首次修改任务信息时，DRAFT → IN_PROGRESS
    if (task.status === 'DRAFT' && updatedFields.length > 0 && !('status' in data)) {
      // 只有在用户实际修改了字段且没有显式设置 status 时才自动推进
      const infoFields = ['title', 'category', 'requirementType', 'requirementName', 'description', 'backgroundUsed']
      if (infoFields.some((f) => updatedFields.includes(f))) {
        updateData.status = 'IN_PROGRESS'
        updatedFields.push('status(auto)')
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    })

    status = 'success'
    return NextResponse.json({ task: updated })
  } catch (err) {
    const { message } = safeServerError(err, 'task-update')
    errorMsg = message
    return NextResponse.json({ error: '更新任务失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'TASK_UPDATE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { updatedFields },
    })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // Rate limit task deletion
  const rl = await consumeRateLimit({
    scope: 'task-delete',
    identifier: session.userId,
    limit: 20,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id } = await params
  if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskTitle = ''

  try {
    const { access } = await getTaskAccess(id, session)
    if (!access) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    // 只有 Owner 可以删除任务
    if (access !== 'OWNER') {
      errorMsg = '只有任务创建者可以删除任务'
      return NextResponse.json({ error: errorMsg }, { status: 403 })
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        models: {
          include: {
            artifacts: { select: { url: true } },
          },
        },
      },
    })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    taskTitle = task.title

    // 先级联清理所有产物 blob 文件（失败不阻断删除，仅警告）
    const artifactUrls: string[] = []
    const screenshotUrls: string[] = []
    for (const model of task.models) {
      for (const artifact of model.artifacts) {
        if (artifact.url) artifactUrls.push(artifact.url)
      }
      // 收集轨迹截图 URL（去重，因为多个 model 可能引用同一张截图）
      const screenshots = parseTrajectoryScreenshots((model as any).screenshotUrls)
      for (const s of screenshots) {
        if (!screenshotUrls.includes(s.url)) screenshotUrls.push(s.url)
      }
    }
    if (artifactUrls.length > 0) {
      await Promise.all(
        artifactUrls.map((url) =>
          deleteArtifactFile(url).catch((err) => {
            console.warn('清理任务产物文件失败:', url, err instanceof Error ? err.message : String(err))
          }),
        ),
      )
    }
    if (screenshotUrls.length > 0) {
      await Promise.all(
        screenshotUrls.map((url) =>
          deleteArtifactFile(url).catch((err) => {
            console.warn('清理任务截图文件失败:', url, err instanceof Error ? err.message : String(err))
          }),
        ),
      )
    }

    // 硬删除：级联删除所有关联数据（models, artifacts, reports, messages, analysis runs, etc.）
    await prisma.task.delete({ where: { id } })

    status = 'success'
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message } = safeServerError(err, 'task-delete')
    errorMsg = message
    return NextResponse.json({ error: '删除任务失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'TASK_DELETE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { title: taskTitle },
    })
  }
}
