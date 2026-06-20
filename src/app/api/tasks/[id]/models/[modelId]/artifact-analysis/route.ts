import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { logAudit } from '@/lib/audit'
import {
  ARTIFACT_ANALYSIS_EVENT_STATUS,
  ARTIFACT_ANALYSIS_RUN_STATUS,
  artifactAnalysisErrorMessage,
  failArtifactAnalysisRun,
} from '@/lib/artifact-analysis-runtime'
import { artifactAnalysisWorkflow } from '@/workflows/artifact-analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function findOwnedModel(taskId: string, modelId: string, userId: string) {
  return prisma.taskModel.findFirst({
    where: {
      id: modelId,
      taskId,
      task: { userId, status: { not: 'DELETED' } },
    },
    include: {
      artifacts: { orderBy: { createdAt: 'asc' } },
      artifactAnalysisRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { events: { orderBy: { sequence: 'asc' } } },
      },
    },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id, modelId } = await params
  const model = await findOwnedModel(id, modelId, session.userId)
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

  return NextResponse.json({
    run: model.artifactAnalysisRuns[0] || null,
    model: {
      id: model.id,
      artifactAnalysisJson: model.artifactAnalysisJson,
      verificationScreenshotUrls: model.verificationScreenshotUrls,
    },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  let taskId: string | null = null
  let userId: string | null = null
  let modelCode = ''
  let analysisModelId: string | null = null
  let analysisRunId: string | null = null
  let workflowStarted = false
  let auditStatus: 'success' | 'error' = 'error'
  let auditError: string | null = null

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    userId = session.userId

    const { id, modelId } = await params
    taskId = id
    const model = await findOwnedModel(id, modelId, session.userId)
    if (!model) {
      auditError = '模型不存在'
      return NextResponse.json({ error: auditError }, { status: 404 })
    }
    modelCode = model.modelCode
    analysisModelId = model.id
    if (model.artifacts.length === 0) {
      auditError = '请先上传模型产物，再开始预分析'
      return NextResponse.json({ error: auditError }, { status: 400 })
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      auditError = '请先配置 AI API'
      return NextResponse.json({ error: auditError }, { status: 400 })
    }

    const activeRun = model.artifactAnalysisRuns[0]
    if (
      activeRun &&
      (activeRun.status === ARTIFACT_ANALYSIS_RUN_STATUS.QUEUED || activeRun.status === ARTIFACT_ANALYSIS_RUN_STATUS.RUNNING)
    ) {
      auditStatus = 'success'
      return NextResponse.json({ run: activeRun, alreadyRunning: true })
    }

    const analysisRun = await prisma.artifactAnalysisRun.create({
      data: {
        taskModelId: model.id,
        status: ARTIFACT_ANALYSIS_RUN_STATUS.QUEUED,
        currentPhase: 'queued',
        nextEventSeq: 1,
        events: {
          create: {
            sequence: 1,
            phase: 'queued',
            status: ARTIFACT_ANALYSIS_EVENT_STATUS.QUEUED,
            label: '已进入后台分析队列',
            detail: '任务已提交，正在准备盘点产物并生成核验证据。',
          },
        },
      },
      include: { events: { orderBy: { sequence: 'asc' } } },
    })
    analysisRunId = analysisRun.id

    const workflowRun = await start(artifactAnalysisWorkflow, [{
      runId: analysisRun.id,
      taskId: id,
      modelId: model.id,
      userId: session.userId,
    }])
    workflowStarted = true

    const run = await prisma.artifactAnalysisRun.update({
      where: { id: analysisRun.id },
      data: { workflowRunId: workflowRun.runId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    })

    auditStatus = 'success'
    return NextResponse.json({ run }, { status: 202 })
  } catch (error) {
    auditError = artifactAnalysisErrorMessage(error)
    if (analysisRunId && taskId && analysisModelId && userId && !workflowStarted) {
      await failArtifactAnalysisRun({
        runId: analysisRunId,
        taskId,
        modelId: analysisModelId,
        userId,
      }, auditError)
    }
    console.error('Artifact analysis workflow could not start:', error)
    return NextResponse.json({ error: `产物预分析启动失败：${auditError}` }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'AI_ARTIFACT_ANALYZE',
      userId,
      taskId,
      status: auditStatus,
      error: auditError,
      durationMs: Date.now() - startedAt,
      detail: { modelCode, mode: 'artifact_analysis_workflow' },
    })
  }
}
