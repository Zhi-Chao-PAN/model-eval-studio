import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import {
  parseVerificationEvidence,
  serializeVerificationEvidence,
  validateVerificationEvidence,
} from '@/lib/verification-evidence'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

// 列出该任务的所有待测模型
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'VIEWER')
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const models = await prisma.taskModel.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      modelCode: true,
      displayName: true,
      createdAt: true,
      processText: true,            // 报告 Tab 中轨迹分析 fallback 使用
      artifactAnalysisJson: true,   // 产物 Tab 徽章状态使用
      artifacts: {
        select: { id: true, name: true, size: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      reports: {
        select: {
          id: true,
          version: true,
          source: true,
          overallScore: true,
          efficiencyScore: true,
          qualityScore: true,
          productFeedback: true,
          overallComment: true,
          efficiencyComment: true,
          qualityComment: true,
          trajectoryAnalysis: true,
          createdAt: true,
        },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  })
  return NextResponse.json({ models })
}

// 创建/批量添加模型
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let addedCount = 0

  try {
    const body = await request.json()
    const modelCodes = body.modelCodes

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    if (!Array.isArray(modelCodes) || modelCodes.length === 0) {
      errorMsg = 'modelCodes 必须是非空数组'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const normalizedCodes = [...new Set(
      modelCodes
        .map((code) => String(code ?? '').trim().toUpperCase())
        .filter((code) => code.length > 0 && code.length <= 32 && /^[A-Z0-9_\-./+]+$/.test(code)),
    )]
    if (normalizedCodes.length === 0) {
      errorMsg = 'modelCodes 必须包含有效模型代号（1-32 位，仅支持字母/数字/._-+/）'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (normalizedCodes.length > 50) {
      errorMsg = '单次最多添加 50 个模型'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const result = await prisma.taskModel.createMany({
      data: normalizedCodes.map((code) => ({
        taskId: id,
        modelCode: code,
        displayName: code,
      })),
      skipDuplicates: true,
    })
    addedCount = result.count

    // 状态机：添加模型时 DRAFT → IN_PROGRESS
    if (addedCount > 0 && task.status === 'DRAFT') {
      await prisma.task.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      })
    }

    const models = await prisma.taskModel.findMany({
      where: { taskId: id, modelCode: { in: normalizedCodes } },
      orderBy: { createdAt: 'asc' },
    })

    status = 'success'
    return NextResponse.json({
      models,
      addedCount,
      skippedCount: normalizedCodes.length - addedCount,
    })
  } finally {
    logAudit(request, {
      action: 'MODEL_ADD',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { addedCount },
    })
  }
}

// 更新模型信息
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelCode = ''

  try {
    const body = await request.json()
    const { modelId, displayName, hardMetricsJson, processText, screenshotUrls, verificationScreenshotUrls } = body

    if (!modelId) {
      errorMsg = 'modelId 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
    })
    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    const data: any = {}
    if (displayName !== undefined) data.displayName = displayName
    if (hardMetricsJson !== undefined) data.hardMetricsJson = hardMetricsJson
    if (processText !== undefined) data.processText = processText
    if (screenshotUrls !== undefined) data.screenshotUrls = screenshotUrls
    if (verificationScreenshotUrls !== undefined) {
      if (verificationScreenshotUrls === null || verificationScreenshotUrls === '') {
        data.verificationScreenshotUrls = null
      } else if (typeof verificationScreenshotUrls !== 'string') {
        errorMsg = '验证截图格式无效'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      } else {
        const evidence = parseVerificationEvidence(verificationScreenshotUrls)
        const validationError = validateVerificationEvidence(evidence)
        if (validationError) {
          errorMsg = validationError
          return NextResponse.json({ error: errorMsg }, { status: 400 })
        }
        data.verificationScreenshotUrls = serializeVerificationEvidence(evidence)
      }
    }

    const updated = await prisma.taskModel.update({ where: { id: modelId }, data })
    status = 'success'
    return NextResponse.json({ model: updated })
  } finally {
    logAudit(request, {
      action: 'MODEL_UPDATE',
      userId: session.userId,
      taskId: id,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelCode },
    })
  }
}
