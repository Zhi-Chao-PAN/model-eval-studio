/**
 * 任务访问权限控制
 *
 * 统一管理任务的访问权限校验，取代各处硬编码的 userId 过滤。
 * 支持：Owner、Editor、Viewer、公开链接、Admin 只读。
 */

import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { SessionData } from '@/lib/session'

export type AccessLevel = 'OWNER' | 'EDITOR' | 'VIEWER' | 'PUBLIC_VIEW'

export interface TaskAccessResult {
  access: AccessLevel | null
  task: any | null
}

// 权限等级数字，用于快速比较
const ACCESS_LEVEL: Record<AccessLevel, number> = {
  OWNER: 4,
  EDITOR: 3,
  VIEWER: 2,
  PUBLIC_VIEW: 1,
}

/** 检查是否达到某个权限等级 */
export function hasAccessLevel(
  access: AccessLevel | null | undefined,
  required: AccessLevel,
): boolean {
  if (!access) return false
  return ACCESS_LEVEL[access] >= ACCESS_LEVEL[required]
}

/**
 * 获取用户对任务的访问权限。
 *
 * @param taskId 任务 ID
 * @param session 会话（可为 null，表示未登录用户，此时仅可能通过 shareToken 访问）
 * @param shareToken 公开共享 token（可选）
 * @param includeDeleted 是否包含已删除的任务（默认 false）
 * @returns 访问权限结果
 */
export async function getTaskAccess(
  taskId: string,
  session: SessionData | null,
  shareToken?: string,
  includeDeleted = false,
): Promise<TaskAccessResult> {
  // 只拉取鉴权需要的最小字段：任务基础列 + 协作者(userId/role)，不拉 shares 全表。
  // shares 仅在传入 shareToken 时通过唯一索引单独查询，避免内存过滤 + 全列加载。
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      userId: true,
      status: true,
      title: true,
      collaborators: {
        select: { userId: true, role: true },
      },
    },
  })

  if (!task) {
    return { access: null, task: null }
  }

  // 已删除的任务默认不返回
  if (!includeDeleted && task.status === 'DELETED') {
    return { access: null, task: null }
  }

  // Owner 权限
  if (session && task.userId === session.userId) {
    return { access: 'OWNER', task }
  }

  // Admin 只读权限
  if (session && session.role === 'ADMIN') {
    return { access: 'VIEWER', task }
  }

  // 协作者权限（这里 collaborators 只含 userId/role，足够判断）
  if (session) {
    const collaborator = (task.collaborators as Array<{ userId: string; role: string }>).find(
      c => c.userId === session.userId,
    )
    if (collaborator) {
      const role = collaborator.role === 'EDITOR' ? 'EDITOR' : 'VIEWER'
      return { access: role as AccessLevel, task }
    }
  }

  // 公开共享链接：直接走 TaskShare.token 唯一索引查询，不走内存过滤
  if (shareToken) {
    const share = await prisma.taskShare.findUnique({
      where: { token: shareToken },
      select: { taskId: true, accessType: true, expiresAt: true },
    })
    if (
      share &&
      share.taskId === taskId &&
      share.accessType === 'VIEW' &&
      (!share.expiresAt || new Date(share.expiresAt) >= new Date())
    ) {
      return { access: 'PUBLIC_VIEW', task }
    }
  }

  return { access: null, task: null }
}

/**
 * 检查用户对任务模型（TaskModel）的访问权限。
 * 本质上还是检查任务级别的权限。
 */
export async function getModelAccess(
  taskId: string,
  modelId: string,
  session: SessionData | null,
  shareToken?: string,
): Promise<{ access: AccessLevel | null; model: any | null; task: any | null }> {
  const { access, task } = await getTaskAccess(taskId, session, shareToken)
  if (!access) {
    return { access: null, model: null, task: null }
  }

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, taskId },
  })

  if (!model) {
    return { access: null, model: null, task: null }
  }

  return { access, model, task }
}

/**
 * 便捷函数：要求至少指定权限，否则抛出 apiError 风格的错误信息。
 * 返回 null 表示有权限，返回 { error, status } 表示无权限。
 */
export function requireAccess(
  access: AccessLevel | null,
  required: AccessLevel,
): { error: string; status: number } | null {
  if (!access) {
    return { error: '任务不存在', status: 404 }
  }
  if (!hasAccessLevel(access, required)) {
    return { error: '无权限执行此操作', status: 403 }
  }
  return null
}

/**
 * 生成一个安全的共享 token。
 * 使用 24 字节 CSPRNG 随机数，编码为 url-safe base64（32 字符），前缀 sh_。
 * 约 192 bit 熵，足以抵御离线暴力枚举。
 */
export function generateShareToken(): string {
  return 'sh_' + randomBytes(24).toString('base64url')
}
