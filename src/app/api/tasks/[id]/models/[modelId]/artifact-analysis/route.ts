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
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, safeServerError } from '@/lib/api-error'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)

    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) return apiError('参数格式无效', 400)

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return apiError(denied.error, denied.status)

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      include: {
        artifacts: { orderBy: { createdAt: 'asc' } },
        artifactAnalysisRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { events: { orderBy: { sequence: 'asc' } } },
        },
      },
    })
    if (!model) return apiError('模型不存在', 404)

    return NextResponse.json({
      run: model.artifactAnalysisRuns[0] || null,
      model: {
        id: model.id,
        artifactAnalysisJson: model.artifactAnalysisJson,
        verificationScreenshotUrls: model.verificationScreenshotUrls,
      },
    })
  } catch (err) {
    const { message } = safeServerError(err, 'artifact-analysis-get')
    return apiError(message, 500)
  }
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
    if (!session) return apiError('未登录', 401)
    userId = session.userId

    const { id, modelId } = await params
    taskId = id
    const rateLimit = await consumeRateLimit({
      scope: 'ai-artifact',
      identifier: session.userId,
      limit: 12,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) {
      auditError = '产物分析请求过于频繁'
      return rateLimitResponse(rateLimit)
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      auditError = denied.error
      return apiError(denied.error, denied.status)
    }

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      include: {
        artifacts: { orderBy: { createdAt: 'asc' } },
        artifactAnalysisRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { events: { orderBy: { sequence: 'asc' } } },
        },
      },
    })
    if (!model) {
      auditError = '模型不存在'
      return apiError(auditError, 404)
    }
    modelCode = model.modelCode
    analysisModelId = model.id
    if (model.artifacts.length === 0) {
      auditError = '请先上传模型产物，再开始预分析'
      return apiError(auditError, 400)
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      auditError = '请先配置 AI API'
      return apiError(auditError, 400)
    }

    // 用 PostgreSQL advisory lock 保护"检查+创建"，消除 TOCTOU 竞态
    const { run: analysisRun, alreadyRunning } = await prisma.$transaction(async (tx) => {
      // 基于 modelId 获取事务级咨询锁，并发请求会在此排队
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${model.id}::text))`

      // 在锁内重新检查是否已有活跃 run（预加载的数据可能已过时）
      const activeRun = await tx.artifactAnalysisRun.findFirst({
        where: {
          taskModelId: model.id,
          status: {
            in: [
              ARTIFACT_ANALYSIS_RUN_STATUS.QUEUED,
              ARTIFACT_ANALYSIS_RUN_STATUS.RUNNING,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { events: { orderBy: { sequence: 'asc' } } },
      })

      if (activeRun) {
        return { run: activeRun, alreadyRunning: true }
      }

      // 没有活跃 run，创建新的
      const newRun = await tx.artifactAnalysisRun.create({
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
              detail: '任务已提交，正在准备盘点、解压和分析产物内容。',
            },
          },
        },
        include: { events: { orderBy: { sequence: 'asc' } } },
      })

      return { run: newRun, alreadyRunning: false }
    })

    analysisRunId = analysisRun.id

    if (alreadyRunning) {
      auditStatus = 'success'
      return NextResponse.json({ run: analysisRun, alreadyRunning: true })
    }

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
    // Use safeServerError for the client response; keep full detail for audit log only
    const { message: safeMsg } = safeServerError(error, 'artifact-analysis-start')
    auditError = artifactAnalysisErrorMessage(error) // full detail for audit log (internal only)
    const clientMsg = '产物预分析启动失败，请稍后重试'
    if (analysisRunId && taskId && analysisModelId && userId && !workflowStarted) {
      await failArtifactAnalysisRun({
        runId: analysisRunId,
        taskId,
        modelId: analysisModelId,
        userId,
      }, safeMsg)
    }
    console.error('Artifact analysis workflow could not start:', error)
    return NextResponse.json({ error: clientMsg }, { status: 500 })
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
