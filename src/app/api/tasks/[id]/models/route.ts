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
import { safeServerError } from '@/lib/api-error'
import { clampDbText, clampRequiredText, isValidCuid } from '@/lib/utils'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const DB_TEXT_LIMITS = {
  DISPLAY_NAME: 80,
  MODEL_CODE: 32,
  HARD_METRICS_JSON: 40_000,
  PROCESS_TEXT: 200_000,
  SCREENSHOT_URLS: 200_000,
} as const

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 列出该任务的所有待测模型
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id } = await params
    if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })

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
        hardMetricsJson: true,
        processText: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ models })
  } catch (err) {
    const { message } = safeServerError(err, 'model-list')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// 创建/批量添加模型
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit model creation
  const rl = await consumeRateLimit({
    scope: 'model-create',
    identifier: session.userId,
    limit: 30,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id } = await params
  if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let addedCount = 0

  try {
    const body = await request.json().catch(() => null)
    if (!isObject(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    const modelCodesRaw = (body as { modelCodes?: unknown }).modelCodes

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const task = await prisma.task.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!task) {
      errorMsg = '任务不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    if (!Array.isArray(modelCodesRaw) || modelCodesRaw.length === 0) {
      errorMsg = 'modelCodes 必须是非空数组'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (modelCodesRaw.length > 50) {
      errorMsg = '单次最多添加 50 个模型'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const normalizedCodes: string[] = []
    const seen = new Set<string>()
    for (const raw of modelCodesRaw) {
      if (typeof raw !== 'string') continue
      const code = raw.trim().toUpperCase()
      if (code.length === 0 || code.length > DB_TEXT_LIMITS.MODEL_CODE) continue
      if (!/^[A-Z0-9_\-./+]+$/.test(code)) continue
      if (seen.has(code)) continue
      seen.add(code)
      normalizedCodes.push(code)
    }

    if (normalizedCodes.length === 0) {
      errorMsg = 'modelCodes 必须包含有效模型代号（1-32 位，仅支持字母/数字/._-+/）'
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
    return NextResponse.json({ models, addedCount })
  } catch (err) {
    const { status: s, message } = safeServerError(err, 'model-create')
    errorMsg = message
    return NextResponse.json({ error: '添加模型失败：' + message }, { status: s })
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

// 更新模型元信息 / 验证截图
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit model updates
  const rl = await consumeRateLimit({
    scope: 'model-update',
    identifier: session.userId,
    limit: 60,
    windowMs: 10 * 60_000,
  })
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id } = await params
  if (!isValidCuid(id)) return NextResponse.json({ error: '任务 ID 无效' }, { status: 400 })

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelCode = ''

  try {
    const body = await request.json().catch(() => null)
    if (!isObject(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const raw = body as {
      modelId?: unknown
      displayName?: unknown
      hardMetricsJson?: unknown
      processText?: unknown
      screenshotUrls?: unknown
      verificationScreenshotUrls?: unknown
    }
    const modelId = isValidCuid(raw.modelId) ? raw.modelId : null

    if (!modelId) {
      errorMsg = 'modelId 必填且格式无效'
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
      select: { id: true, modelCode: true },
    })
    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    const data: Record<string, unknown> = {}

    if (raw.displayName !== undefined) {
      if (typeof raw.displayName !== 'string') {
        errorMsg = 'displayName 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      data.displayName = clampRequiredText(raw.displayName, DB_TEXT_LIMITS.DISPLAY_NAME)
    }

    if (raw.hardMetricsJson !== undefined) {
      if (raw.hardMetricsJson === null) {
        data.hardMetricsJson = null
      } else if (typeof raw.hardMetricsJson !== 'string') {
        errorMsg = 'hardMetricsJson 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      } else if (raw.hardMetricsJson.length > DB_TEXT_LIMITS.HARD_METRICS_JSON) {
        errorMsg = `hardMetricsJson 过长（最多 ${DB_TEXT_LIMITS.HARD_METRICS_JSON} 字符）`
        return NextResponse.json({ error: errorMsg }, { status: 413 })
      } else {
        data.hardMetricsJson = raw.hardMetricsJson
      }
    }

    if (raw.processText !== undefined) {
      if (raw.processText === null) {
        data.processText = null
      } else if (typeof raw.processText !== 'string') {
        errorMsg = 'processText 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      } else {
        data.processText = clampDbText(raw.processText, DB_TEXT_LIMITS.PROCESS_TEXT)
      }
    }

    if (raw.screenshotUrls !== undefined) {
      if (raw.screenshotUrls === null) {
        data.screenshotUrls = null
      } else if (typeof raw.screenshotUrls !== 'string') {
        errorMsg = 'screenshotUrls 必须是字符串'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      } else if (raw.screenshotUrls.length > DB_TEXT_LIMITS.SCREENSHOT_URLS) {
        errorMsg = `screenshotUrls 过长（最多 ${DB_TEXT_LIMITS.SCREENSHOT_URLS} 字符）`
        return NextResponse.json({ error: errorMsg }, { status: 413 })
      } else {
        data.screenshotUrls = raw.screenshotUrls
      }
    }

    if (raw.verificationScreenshotUrls !== undefined) {
      if (raw.verificationScreenshotUrls === null || raw.verificationScreenshotUrls === '') {
        data.verificationScreenshotUrls = null
      } else if (typeof raw.verificationScreenshotUrls !== 'string') {
        errorMsg = '验证截图格式无效'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      } else {
        const evidence = parseVerificationEvidence(raw.verificationScreenshotUrls)
        const validationError = validateVerificationEvidence(evidence)
        if (validationError) {
          errorMsg = validationError
          return NextResponse.json({ error: errorMsg }, { status: 400 })
        }
        data.verificationScreenshotUrls = serializeVerificationEvidence(evidence)
      }
    }

    if (Object.keys(data).length === 0) {
      errorMsg = '没有提供可更新字段'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const updated = await prisma.taskModel.update({ where: { id: modelId }, data })
    status = 'success'
    return NextResponse.json({ model: updated })
  } catch (err) {
    const { status: s, message } = safeServerError(err, 'model-update')
    errorMsg = message
    return NextResponse.json({ error: '更新模型失败：' + message }, { status: s })
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
