/**
 * 统一的 API 错误响应工具
 *
 * 所有 API 错误都应使用 apiError() 返回，确保前端能一致地解析错误信息。
 *
 * 响应格式：
 * {
 *   error: string,     // 面向用户的错误消息（中文）
 *   code?: string,     // 机器可读的错误代码（可选）
 *   details?: unknown, // 额外调试信息（仅开发环境）
 * }
 */

export interface ApiErrorResponse {
  error: string
  code?: string
  details?: unknown
}

export function apiError(
  message: string,
  status: number = 400,
  code?: string,
  details?: unknown,
): Response {
  const body: ApiErrorResponse = { error: message }
  if (code) body.code = code

  // 开发环境下附带详细信息，生产环境不暴露内部细节
  if (details !== undefined && process.env.NODE_ENV !== 'production') {
    body.details = details
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 从任意异常中提取安全的错误消息。
 * 用于 catch 块中，避免把内部堆栈或敏感信息直接返回给用户。
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return '未知错误'
}
