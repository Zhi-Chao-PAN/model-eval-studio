import { prisma } from './prisma'
import type { AuditAction } from '@prisma/client'

export interface AuditLogInput {
  action: AuditAction
  userId?: string | null
  taskId?: string | null
  detail?: Record<string, unknown> | null
  status?: 'success' | 'error'
  error?: string | null
  tokenInput?: number | null
  tokenOutput?: number | null
  durationMs?: number | null
}

/**
 * Write an audit log entry. Never throws – failures are silently logged to stderr
 *
 * so audit logging never breaks the main request flow.
 */
export async function logAudit(
  request: Request | { url: string; method: string; headers: Headers },
  input: AuditLogInput,
): Promise<void> {
  try {
    const url = new URL(request.url)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip')?.trim() ??
      null
    const userAgent = request.headers.get('user-agent') ?? null

    // Fire and forget-ish: await the write but catch so the caller
    // can optionally await for consistency.
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        taskId: input.taskId ?? null,
        detail: (input.detail ?? undefined) as any,
        ipAddress: ip,
        userAgent,
        path: url.pathname,
        method: request.method,
        status: input.status ?? null,
        error: input.error ?? null,
        tokenInput: input.tokenInput ?? null,
        tokenOutput: input.tokenOutput ?? null,
        durationMs: input.durationMs ?? null,
      },
    })
  } catch (e) {
    // Audit logging must never break the main flow.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write audit log:', e)
  }
}
