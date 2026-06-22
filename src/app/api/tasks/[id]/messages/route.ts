import { NextResponse } from 'next/server'
import { TaskStep } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system'])
const MAX_MESSAGE_LENGTH = 100_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const { id } = await params

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    const messages = await prisma.taskMessage.findMany({
      where: { taskId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    return NextResponse.json({ messages: messages.reverse() })
  } catch (err) {
    const { message } = safeServerError(err, 'messages-get')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const rateLimit = await consumeRateLimit({
      scope: 'message-write',
      identifier: session.userId,
      limit: 120,
      windowMs: 10 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求内容格式无效' }, { status: 400 })
    }

    const role = typeof body.role === 'string' ? body.role.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    const step = typeof body.step === 'string' ? body.step : ''
    const modelId = typeof body.modelId === 'string' && body.modelId.trim()
      ? body.modelId.trim()
      : null

    if (!role || !content || !step) {
      return NextResponse.json({ error: 'role / content / step 必填' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: '消息角色无效' }, { status: 400 })
    }
    if (!Object.values(TaskStep).includes(step as TaskStep)) {
      return NextResponse.json({ error: '任务阶段无效' }, { status: 400 })
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: '消息内容过长' }, { status: 413 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    if (modelId) {
      const model = await prisma.taskModel.findFirst({
        where: { id: modelId, taskId: id },
        select: { id: true },
      })
      if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })
    }

    const msg = await prisma.taskMessage.create({
      data: { taskId: id, role, content, step: step as TaskStep, modelId },
    })
    return NextResponse.json({ message: msg })
  } catch (err) {
    const { message } = safeServerError(err, 'message-create')
    return NextResponse.json({ error: '发送消息失败：' + message }, { status: 500 })
  }
}
