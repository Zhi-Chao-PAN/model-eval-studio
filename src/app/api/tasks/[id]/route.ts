import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { deleteArtifactFile } from '@/lib/artifact-storage'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params

  const task = await prisma.task.findFirst({
    where: {
      id,
      userId: session.userId,
      status: { not: 'DELETED' },
    },
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
                url: true,
                size: true,
                mimeType: true,
                previewJson: true,
                createdAt: true,
              },
            },
            reports: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                productFeedback: true,
                verificationSummary: true,
                overallScore: true,
                overallComment: true,
                efficiencyScore: true,
                efficiencyComment: true,
                qualityScore: true,
                qualityComment: true,
                trajectoryAnalysis: true,
                createdAt: true,
                updatedAt: true,
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

  return NextResponse.json({
    task: {
      ...task,
      messages: [...task.messages].reverse(),
    },
  })
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

  const { id } = await params
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
    const updatedFields: string[] = []

  try {
    const data = await request.json()

    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
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

    const updateData: any = {}
    for (const key of allowed) {
      if (key in data) {
        updateData[key] = data[key]
        updatedFields.push(key)
      }
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

  const { id } = await params
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let taskTitle = ''

  try {
    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
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
    for (const model of task.models) {
      for (const artifact of model.artifacts) {
        if (artifact.url) artifactUrls.push(artifact.url)
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

    // 硬删除：级联删除所有关联数据（models, artifacts, reports, messages, analysis runs, etc.）
    await prisma.task.delete({ where: { id } })

    status = 'success'
    return NextResponse.json({ ok: true })
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
