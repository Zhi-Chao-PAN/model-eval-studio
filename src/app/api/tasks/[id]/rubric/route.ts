import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, safeServerError } from '@/lib/api-error'
import {
  getDefaultRubric,
  validateRubric,
  serializeDimensions,
  parseDimensions,
  type RubricData,
} from '@/lib/rubric-templates'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { isValidCuid } from '@/lib/utils'

// 获取任务的评分规则
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)
    const { id } = await params
    if (!isValidCuid(id)) return apiError('任务 ID 无效', 400)

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return apiError(denied.error, denied.status)

    const rubricRecord = await prisma.evaluationRubric.findUnique({
      where: { taskId: id },
    })

    const task = await prisma.task.findUnique({
      where: { id },
      select: { category: true, requirementType: true },
    })

    if (rubricRecord) {
      const rubric: RubricData = {
        templateType: rubricRecord.templateType as RubricData['templateType'],
        dimensions: parseDimensions(rubricRecord.dimensionsJson),
        overallFormula: rubricRecord.overallFormula || '',
      }
      return NextResponse.json({ rubric, isCustom: true })
    }

    // 没有自定义 rubric，返回基于任务类型的默认模板
    const defaultRubric = getDefaultRubric(task?.category || task?.requirementType)
    return NextResponse.json({ rubric: defaultRubric, isCustom: false })
  } catch (err) {
    const { message } = safeServerError(err, 'rubric-get')
    return apiError(message, 500)
  }
}

// 更新任务的评分规则
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return apiError('未登录', 401)

    // Rate limit rubric updates
    const rl = await consumeRateLimit({
      scope: 'rubric-update',
      identifier: session.userId,
      limit: 30,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id } = await params
    if (!isValidCuid(id)) return apiError('任务 ID 无效', 400)

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'OWNER')
    if (denied) return apiError(denied.error, denied.status)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('请求内容格式无效', 400)
    }
    const rubricData = (body as Record<string, unknown>).rubric
    if (!rubricData || typeof rubricData !== 'object' || Array.isArray(rubricData)) {
      return apiError('评分规则数据无效', 400)
    }

    const validation = validateRubric(rubricData as RubricData)
    if (!validation.valid) {
      return apiError(validation.error || '评分规则无效', 400)
    }

    const existing = await prisma.evaluationRubric.findUnique({
      where: { taskId: id },
    })

    const dimensionsJson = serializeDimensions((rubricData as RubricData).dimensions)

    const rubricRecord = existing
      ? await prisma.evaluationRubric.update({
          where: { taskId: id },
          data: {
            templateType: (rubricData as RubricData).templateType,
            dimensionsJson,
            overallFormula: (rubricData as RubricData).overallFormula || null,
          },
        })
      : await prisma.evaluationRubric.create({
          data: {
            taskId: id,
            templateType: (rubricData as RubricData).templateType,
            dimensionsJson,
            overallFormula: (rubricData as RubricData).overallFormula || null,
          },
        })

    const rubric: RubricData = {
      templateType: rubricRecord.templateType as RubricData['templateType'],
      dimensions: parseDimensions(rubricRecord.dimensionsJson),
      overallFormula: rubricRecord.overallFormula || '',
    }

    return NextResponse.json({ rubric, isCustom: true })
  } catch (err) {
    const { message } = safeServerError(err, 'rubric-update')
    return apiError('更新评分规则失败：' + message, 500)
  }
}
