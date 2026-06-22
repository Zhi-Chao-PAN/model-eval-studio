import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { safeServerError } from '@/lib/api-error'
import { getTaskAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/tasks/[id]/duplicate
 * Creates a copy of the task (title, description, category, models, rubric)
 * without artifacts, reports, messages, shares, or collaborators.
 * The new task is owned by the requesting user.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let newTaskId: string | null = null
  let sourceId: string = ''

  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const rl = await consumeRateLimit({
    scope: 'task-duplicate',
    identifier: session.userId,
    limit: 20,
    windowMs: 60 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const { id } = await params
    sourceId = id
    if (!isValidCuid(id)) {
      errorMsg = '任务 ID 格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    if (!access) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    // Load original task
    const original = await prisma.task.findUnique({
      where: { id },
      include: {
        models: { select: { modelCode: true, displayName: true } },
        rubric: { select: { dimensionsJson: true, overallFormula: true, templateType: true } },
      },
    })
    if (!original) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const newTask = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          userId: session.userId,
          title: original.title + ' (副本)',
          description: original.description,
          category: original.category,
          currentStep: 'DESIGN',
        },
      })

      // Copy rubric dimensions if they exist
      if (original.rubric) {
        await tx.evaluationRubric.create({
          data: {
            taskId: task.id,
            templateType: original.rubric.templateType,
            dimensionsJson: original.rubric.dimensionsJson,
            overallFormula: original.rubric.overallFormula,
          },
        })
      }

      // Copy models (bare bones only)
      for (const m of original.models) {
        await tx.taskModel.create({
          data: {
            taskId: task.id,
            modelCode: m.modelCode,
            displayName: m.displayName,
          },
        })
      }

      return task
    })

    newTaskId = newTask.id
    status = 'success'
    return NextResponse.json({ id: newTask.id, title: newTask.title })
  } catch (err) {
    const { message } = safeServerError(err, 'task-duplicate')
    errorMsg = message
    return NextResponse.json({ error: '复制任务失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'TASK_CREATE',
      userId: session.userId,
      taskId: newTaskId || undefined,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { duplicatedFrom: sourceId },
    })
  }
}
