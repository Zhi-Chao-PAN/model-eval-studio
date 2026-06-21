import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { apiError, errorMessage } from '@/lib/api-error'
import {
  getDefaultRubric,
  validateRubric,
  serializeDimensions,
  parseDimensions,
  type RubricData,
} from '@/lib/rubric-templates'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

// 获取任务的评分规则
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

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
}

// 更新任务的评分规则
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return apiError('未登录', 401)
  const { id } = await params

  const { access } = await getTaskAccess(id, session)
  const denied = requireAccess(access, 'OWNER')
  if (denied) return apiError(denied.error, denied.status)

  try {
    const body = await request.json()
    const rubricData = body.rubric

    const validation = validateRubric(rubricData)
    if (!validation.valid) {
      return apiError(validation.error || '评分规则无效', 400)
    }

    const existing = await prisma.evaluationRubric.findUnique({
      where: { taskId: id },
    })

    const dimensionsJson = serializeDimensions(rubricData.dimensions)

    const rubricRecord = existing
      ? await prisma.evaluationRubric.update({
          where: { taskId: id },
          data: {
            templateType: rubricData.templateType,
            dimensionsJson,
            overallFormula: rubricData.overallFormula || null,
          },
        })
      : await prisma.evaluationRubric.create({
          data: {
            taskId: id,
            templateType: rubricData.templateType,
            dimensionsJson,
            overallFormula: rubricData.overallFormula || null,
          },
        })

    const rubric: RubricData = {
      templateType: rubricRecord.templateType as RubricData['templateType'],
      dimensions: parseDimensions(rubricRecord.dimensionsJson),
      overallFormula: rubricRecord.overallFormula || '',
    }

    return NextResponse.json({ rubric, isCustom: true })
  } catch (err) {
    return apiError('更新评分规则失败：' + errorMessage(err), 500)
  }
}
