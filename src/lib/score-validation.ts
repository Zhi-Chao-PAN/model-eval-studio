/**
 * 评分字段校验工具。
 *
 * 统一所有报告评分写入路径（AI 生成 / 手动保存 / 人工修订）的评分范围与步长校验。
 */

export interface ScoreConstraints {
  min?: number
  max?: number
  /** 允许的步长（例如 0.5 表示 1, 1.5, 2, ..., 10；1 表示整数） */
  step?: number
  /** 是否必填（true 时 undefined 也报错） */
  required?: boolean
}

export const INTEGER_SCORE: ScoreConstraints = { min: 1, max: 10, step: 1 }
export const HALF_STEP_SCORE: ScoreConstraints = { min: 1, max: 10, step: 0.5 }

export interface ScoreValidationInput {
  overallScore?: unknown
  efficiencyScore?: unknown
  qualityScore?: unknown
}

function validateOne(value: unknown, label: string, c: ScoreConstraints): string | null {
  if (value === undefined || value === null) {
    if (c.required) return label + '必填'
    return null
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return label + '必须是数字'
  }
  const { min = 1, max = 10, step } = c
  if (value < min || value > max) {
    return label + '必须在 ' + min + '-' + max + ' 之间'
  }
  if (step && step > 0) {
    const multiples = 1 / step
    const rounded = Math.round(value * multiples) / multiples
    if (Math.abs(rounded - value) > 1e-9) {
      return label + '步长必须为 ' + step
    }
  }
  return null
}

/**
 * 校验一组评分字段（综合/效率/质量）。
 * 返回 null 表示全部通过；否则返回中文错误信息。
 */
export function validateScores(
  input: ScoreValidationInput,
  opts: { required?: boolean } = {},
): string | null {
  const required = opts.required ?? false
  const errs = [
    validateOne(input.overallScore, '综合评分', { ...INTEGER_SCORE, required }),
    validateOne(input.efficiencyScore, '交付效率', { ...HALF_STEP_SCORE, required }),
    validateOne(input.qualityScore, '产物质量', { ...HALF_STEP_SCORE, required }),
  ].filter(Boolean) as string[]
  return errs.length > 0 ? errs.join('；') : null
}

/**
 * 规范化评分值（undefined → null；确保数字类型）。用于写入 Prisma。
 */
export function normalizeScore(value: unknown, fallback?: number): number | null | undefined {
  if (value === undefined) return fallback === undefined ? undefined : fallback
  if (value === null) return null
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return value
}

function toClampedReportScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(10, n))
}

export function normalizeValidatedIntegerScore(value: unknown): number {
  return Math.round(toClampedReportScore(value))
}

export function normalizeValidatedHalfStepScore(value: unknown): number {
  return Math.round(toClampedReportScore(value) * 2) / 2
}
