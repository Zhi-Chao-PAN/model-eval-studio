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

// Prisma error codes that map to common client-meaningful errors.
// Anything else should be reported as a generic server error in production.
const KNOWN_PRISMA_PATTERNS: Array<{ re: RegExp; userMessage: string }> = [
  // Foreign key violation (lookup by non-existent id)
  { re: /Foreign key constraint failed|P2003/, userMessage: '关联的记录不存在' },
  // Unique constraint violation
  { re: /Unique constraint failed|P2002/, userMessage: '记录已存在，请勿重复操作' },
  // Record not found (findUniqueOrThrow)
  { re: /Record to update not found|No \w+ found|P2025|P2018/, userMessage: '记录不存在' },
  // DB connection / auth errors should NEVER leak connection strings
  { re: /Authentication failed|Connection.*refused|connect ECONN|ETIMEDOUT|ENOTFOUND/, userMessage: '数据库连接失败，请稍后重试' },
  // Query engine panics
  { re: /Invalid .*invocation|Query engine|NAPI|PANIC/i, userMessage: '数据查询错误，请稍后重试' },
]

// Patterns that indicate leaked internals that should never reach the client
// even in development — e.g. file paths, connection strings, stack frames.
const INTERNAL_LEAK_PATTERNS = [
  /(?:\\\\|\/)(?:home\/|Users\/|usr\/|app\/|opt\/)[^\s"']*/i, // absolute paths
  /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']*/i,          // connection strings
  /\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*\S+/i,    // credential leaks
  /at\s+\S+\s+\((?:file:\/\/)?(?:\w:)?[/\\]/i,                // stack frames with path
  /__vite_prisma|PrismaClientInitializationError|PrismaClientKnownRequestError/,
]

function stripSensitiveDetails(msg: string): string {
  let out = msg
  for (const pat of INTERNAL_LEAK_PATTERNS) {
    out = out.replace(pat, '[已隐藏敏感信息]')
  }
  return out
}

/**
 * Log an error to server console (always logs the full error with context)
 * and return a message suitable for returning to the client.
 *
 * - In development: returns the actual error message (with sensitive patterns
 *   stripped) to help developers debug.
 * - In production: returns a generic message unless the error matches a known
 *   Prisma constraint we can translate into a helpful user-facing message.
 */
export function safeServerError(err: unknown, context: string): { status: number; message: string } {
  // Always log the full error server-side for diagnostics
  console.error(`[${context}]`, err)

  const rawMessage = errorMessage(err)

  // Prisma/DB-like errors: try to map to a user-facing message
  for (const { re, userMessage } of KNOWN_PRISMA_PATTERNS) {
    if (re.test(rawMessage)) {
      return { status: 400, message: userMessage }
    }
  }

  // Known client-side errors already in Chinese (validation errors we threw
  // ourselves with throw new Error('...中文...')) — pass them through but
  // strip any accidental path/credential leaks.
  if (process.env.NODE_ENV !== 'production') {
    return { status: 500, message: '服务器内部错误：' + stripSensitiveDetails(rawMessage) }
  }

  return { status: 500, message: '服务器内部错误，请稍后重试' }
}
