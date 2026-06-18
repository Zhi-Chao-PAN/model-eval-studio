import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'

// 获取所有邀请码
export async function GET() {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { username: true } } },
  })

  return NextResponse.json({ invites })
}

// 创建邀请码
export async function POST(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { count = 1, expiresAt, maxUses = 1 } = await request.json()

  const results = []
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    const invite = await prisma.inviteCode.create({
      data: {
        code,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxUses: Number(maxUses) || 1,
        createdById: session.userId,
      },
    })
    results.push(invite)
  }

  return NextResponse.json({ invites: results })
}

// 批量操作（禁用/启用/删除）
export async function PATCH(request: Request) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const { id, action } = await request.json()
  if (!id || !action) {
    return NextResponse.json({ error: 'id 和 action 必填' }, { status: 400 })
  }

  if (action === 'toggle') {
    const invite = await prisma.inviteCode.findUnique({ where: { id } })
    if (!invite) return NextResponse.json({ error: '未找到' }, { status: 404 })
    const updated = await prisma.inviteCode.update({
      where: { id },
      data: { active: !invite.active },
    })
    return NextResponse.json({ invite: updated })
  }

  if (action === 'delete') {
    await prisma.inviteCode.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
