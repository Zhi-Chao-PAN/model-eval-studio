import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError, safeServerError } from '@/lib/api-error'
import { consumeRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

// 公开只读页允许返回的报告字段（白名单，禁止泄露 generationSnapshot / generationConfig 等内部字段）
const PUBLIC_REPORT_SELECT = {
  id: true,
  version: true,
  source: true,
  overallScore: true,
  efficiencyScore: true,
  qualityScore: true,
  productFeedback: true,
  efficiencyComment: true,
  qualityComment: true,
  overallComment: true,
  trajectoryAnalysis: true,
  createdAt: true,
} as const

// 公开只读页允许返回的模型字段（白名单）
const PUBLIC_MODEL_SELECT = {
  id: true,
  modelCode: true,
  displayName: true,
  createdAt: true,
} as const

// 通过公开链接获取任务信息（只读，无需登录）
// 使用基于 IP 的速率限制以防御共享 token 枚举/抓取。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
  const ip = getRequestIp(request)
  const rateLimit = await consumeRateLimit({
    scope: 'public-share',
    identifier: ip,
    limit: 120,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  const { token } = await params

  // Share tokens are always generated as "sh_" + 32 base64url chars (35 total).
  // Tighten validation to prevent unnecessary DB hits for malformed tokens.
  if (typeof token !== 'string' || !/^sh_[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return apiError('共享链接无效', 404)
  }

  const share = await prisma.taskShare.findUnique({
    where: { token },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          backgroundUsed: true,
          category: true,
          status: true,
          currentStep: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { username: true },
          },
          models: {
            select: {
              ...PUBLIC_MODEL_SELECT,
              reports: {
                select: PUBLIC_REPORT_SELECT,
                orderBy: { version: 'desc' },
                take: 1,
              },
              artifacts: {
                select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })

  if (!share || !share.task || share.task.status === 'DELETED') {
    return apiError('共享链接无效或已过期', 404)
  }

  // 防御纵深：只允许 VIEW 类型的共享访问
  if (share.accessType !== 'VIEW') {
    return apiError('共享链接无效', 404)
  }

  // 检查是否过期
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return apiError('共享链接已过期', 410)
  }

  return NextResponse.json({
    task: share.task,
    share: {
      id: share.id,
      accessType: share.accessType,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    },
  })
  } catch (err) {
    const { message } = safeServerError(err, 'public-share')
    return apiError(message, 500)
  }
}
