import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { parseVerificationEvidence, serializeVerificationEvidence } from '@/lib/verification-evidence'
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

    return NextResponse.json({
      verificationScreenshotUrls: evidence,
      verificationScreenshotSerialized: model.verificationScreenshotUrls
        ? serializeVerificationEvidence(evidence)
        : '',
    })
  } catch (err) {
    const { message } = safeServerError(err, 'verification-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
