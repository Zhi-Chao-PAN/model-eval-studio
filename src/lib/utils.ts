import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('zh-CN', options ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

export function formatDateTime(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

/**
 * 数据库 @db.Text 字段应用层长度上限。
 * 防止故障 AI / prompt 注入 / 上游异常灌入超大文本，撑爆响应或 DB 写入。
 */
export const DB_TEXT_LIMITS = {
  /** 单段评论文本（产品反馈/效率/质量/综合评论）上限 */
  COMMENT: 8_000,
  /** 轨迹/分析类文本上限（通常较长） */
  ANALYSIS: 20_000,
  /** verificationSummary 截图视觉解读上限 */
  VERIFICATION: 5_000,
} as const

/**
 * 防御性截断：超过 maxLen 时截断并追加省略标记。
 * null/undefined 原样返回；非字符串强转为字符串（兜底）。
 */
export function clampDbText(
  text: string | null | undefined,
  maxLen: number,
): string | null | undefined {
  if (text == null) return text
  const s = typeof text === 'string' ? text : String(text)
  if (s.length <= maxLen) return s
  return s.slice(0, Math.max(0, maxLen - 3)) + '...'
}

/**
 * 必填字段专用截断：null/undefined/'' 兜底为空串；保证返回 string。
 */
export function clampRequiredText(text: string | null | undefined, maxLen: number): string {
  const clamped = clampDbText(text, maxLen)
  return clamped ?? ''
}

/**
 * Validate a CUID/CUID2-style identifier. Accepts lowercase alphanumeric IDs
 * of length 20–32 (covers Prisma cuid() and cuid2() defaults). Used to reject
 * malformed path parameters early before hitting the database.
 */
const CUID_PATTERN = /^[a-z0-9]{20,32}$/
export function isValidCuid(value: unknown): value is string {
  return typeof value === 'string' && CUID_PATTERN.test(value)
}
