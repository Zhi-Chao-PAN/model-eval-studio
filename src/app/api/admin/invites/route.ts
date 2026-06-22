import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { logAudit } from '@/lib/audit'

// Invite codes are 16-char uppercase hex (64 bits entropy). Users type them by
// hand so we keep them shorter than share tokens but well beyond online
// brute-force feasibility (registration is already rate-limited 5/hour/IP).
const INVITE_CODE_BYTES = 8
const MAX_CREATE_COUNT = 100
const MAX_USES_LIMIT = 1000

function generateCode(): string {
  return crypto.randomBytes(INVITE_CODE_BYTES).toString('hex').toUpperCase()
}

function validateId(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (!/^[a-z0-9]{20,32}$/.test(value)) return null
  return value
}

// 获取所有邀请码
export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { username: true } } },
  })

  return NextResponse.json({ invites })
}

// 创建邀请码
export async function POST(request: Request) {
  const startedAt = Date.now()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let createdCount = 0

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const rawCount = (body as { count?: unknown }).count
    const rawExpiresAt = (body as { expiresAt?: unknown }).expiresAt
    const rawMaxUses = (body as { maxUses?: unknown }).maxUses

    const count = rawCount === undefined ? 1 : Number(rawCount)
    const maxUses = rawMaxUses === undefined ? 1 : Number(rawMaxUses)

    if (!Number.isInteger(count) || count < 1 || count > MAX_CREATE_COUNT) {
      errorMsg = `批量创建数量必须为 1-${MAX_CREATE_COUNT} 的整数`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES_LIMIT) {
      errorMsg = `使用次数上限必须为 1-${MAX_USES_LIMIT} 的整数`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    let expiresAt: Date | null = null
    if (rawExpiresAt !== undefined && rawExpiresAt !== null && rawExpiresAt !== '') {
      if (typeof rawExpiresAt !== 'string' && typeof rawExpiresAt !== 'number') {
        errorMsg = '过期时间格式无效'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      const parsed = new Date(rawExpiresAt)
      if (Number.isNaN(parsed.getTime())) {
        errorMsg = '过期时间格式无效'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        errorMsg = '过期时间不能早于当前时间'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      expiresAt = parsed
    }

    const results = []
    for (let i = 0; i < count; i++) {
      let code: string
      let attempt = 0
      do {
        code = generateCode()
        attempt++
        if (attempt > 5) {
          errorMsg = '邀请码生成冲突，请重试'
          return NextResponse.json({ error: errorMsg }, { status: 500 })
        }
      } while (
        await prisma.inviteCode.findUnique({ where: { code }, select: { id: true } })
      )

      const invite = await prisma.inviteCode.create({
        data: { code, expiresAt, maxUses, createdById: session.userId },
      })
      results.push(invite)
    }
    createdCount = results.length
    status = 'success'

    return NextResponse.json({ invites: results })
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : '创建失败'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'ADMIN_INVITE_CREATE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { count: createdCount },
    })
  }
}

// 批量操作（禁用/启用/删除）
export async function PATCH(request: Request) {
  const startedAt = Date.now()
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: '无权限' }, { status: 403 })

  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let actionName = ''
  let inviteCode = ''

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { id: rawId, action } = body as { id?: unknown; action?: unknown }
    actionName = typeof action === 'string' ? action : ''

    const id = validateId(rawId)
    if (!id) {
      errorMsg = '邀请码 ID 格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (typeof action !== 'string' || !action) {
      errorMsg = 'action 必填'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    if (action === 'toggle') {
      const invite = await prisma.inviteCode.findUnique({ where: { id } })
      if (!invite) {
        errorMsg = '未找到'
        return NextResponse.json({ error: errorMsg }, { status: 404 })
      }
      inviteCode = invite.code
      const updated = await prisma.inviteCode.update({
        where: { id },
        data: { active: !invite.active },
      })
      status = 'success'
      return NextResponse.json({ invite: updated })
    }

    if (action === 'delete') {
      const invite = await prisma.inviteCode.findUnique({ where: { id } })
      inviteCode = invite?.code || ''
      if (invite) await prisma.inviteCode.delete({ where: { id } })
      status = 'success'
      return NextResponse.json({ ok: true })
    }

    errorMsg = '未知操作'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  } finally {
    logAudit(request, {
      action: 'ADMIN_INVITE_TOGGLE',
      userId: session.userId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { action: actionName, code: inviteCode },
    })
  }
}
