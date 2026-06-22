import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import {
  parseVerificationEvidence,
  serializeVerificationEvidence,
  validateVerificationEvidence,
  type VerificationEvidence,
} from '@/lib/verification-evidence'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) {
      return NextResponse.json({ error: '参数格式无效' }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: {
        id: true,
        verificationScreenshotUrls: true,
      },
    })

    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    const evidence = model.verificationScreenshotUrls
      ? parseVerificationEvidence(model.verificationScreenshotUrls)
      : []

    const serialized = evidence.length ? serializeVerificationEvidence(evidence) : ''

    return NextResponse.json({
      verificationScreenshotUrls: serialized,
      verificationScreenshotSerialized: serialized,
      verificationEvidence: evidence,
    })
  } catch (err) {
    const { message } = safeServerError(err, 'verification-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const { id, modelId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId)) {
      return NextResponse.json({ error: '参数格式无效' }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true },
    })
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    const raw = (body as Record<string, unknown>).verificationScreenshotUrls
    let evidence: VerificationEvidence[] = []
    let serialized: string | null = null

    if (raw !== undefined && raw !== null && raw !== '') {
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: '验证截图格式无效' }, { status: 400 })
      }

      evidence = parseVerificationEvidence(raw)
      if (evidence.length === 0) {
        return NextResponse.json({ error: '验证截图内容无法解析' }, { status: 400 })
      }
      const validationError = validateVerificationEvidence(evidence)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
      serialized = evidence.length ? serializeVerificationEvidence(evidence) : null
    }

    await prisma.taskModel.update({
      where: { id: modelId },
      data: { verificationScreenshotUrls: serialized },
    })

    return NextResponse.json({
      verificationScreenshotUrls: serialized || '',
      verificationScreenshotSerialized: serialized || '',
      verificationEvidence: evidence,
    })
  } catch (err) {
    const { message } = safeServerError(err, 'verification-put')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
