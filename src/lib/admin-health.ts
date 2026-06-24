/**
 * 管理后台「健康监控」纯函数聚合层。
 *
 * 输入：从 prisma 查到的 AuditLog 数组（已带 user 关联）。
 * 输出：5 个独立的视角化模型——按操作类型 / 失败分类 / 延迟分布 / 24h 趋势 / 用户排行。
 *
 * 设计原则：
 * - 完全纯函数，不读 DB、不读 Date.now()——所有时间窗口由调用方传入。
 * - 输入类型用结构化最小接口 `HealthAuditRecord`，与 Prisma 解耦，便于单测。
 * - 不做"今日/7天/30天"语义解析；调用方自己算时间区间再传。
 */

// ============================================================
// 输入类型
// ============================================================

/** 健康监控只关心 AuditLog 的这几个字段。 */
export interface HealthAuditRecord {
  action: string
  status: string | null
  error: string | null
  durationMs: number | null
  tokenInput: number | null
  tokenOutput: number | null
  createdAt: Date | string
  userId: string | null
  user?: { username: string } | null
}

// ============================================================
// 错误分类
// ============================================================

export type FailureCategory =
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'server_error'
  | 'json_parse'
  | 'network'
  | 'token_limit'
  | 'cancelled'
  | 'other'

const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  timeout: 'AI 调用超时',
  rate_limit: '上游限流 (429)',
  auth: '鉴权失败 (401/403)',
  server_error: '上游 5xx',
  json_parse: '响应解析失败',
  network: '网络错误',
  token_limit: 'Token 上限',
  cancelled: '用户取消',
  other: '其它',
}

export function getFailureCategoryLabel(c: FailureCategory): string {
  return FAILURE_CATEGORY_LABELS[c]
}

/**
 * 根据自由文本的错误信息，按白名单规则归类。
 *
 * 顺序敏感：先匹配的胜出。例如 "Request timed out (429 in retry)" 归 timeout。
 * 这是经验工程，准确度 ≈ 70-80%。
 */
export function categorizeError(error: string | null | undefined): FailureCategory {
  if (!error) return 'other'
  const lower = error.toLowerCase()

  // 顺序：先具体的，后宽泛的
  if (/timeout|timed out|esockettimedout|deadline exceeded/.test(lower)) return 'timeout'
  if (/429|rate.?limit|too many requests/.test(lower)) return 'rate_limit'
  if (/\b401\b|\b403\b|unauthor|forbidden|invalid api key|incorrect api key/.test(lower)) return 'auth'
  if (/\b5\d{2}\b|internal server error|bad gateway|service unavailable|gateway timeout/.test(lower)) {
    return 'server_error'
  }
  if (/token.{0,20}(limit|exceed|max|too long)|context.{0,5}length|max.{0,10}tokens/.test(lower)) return 'token_limit'
  if (/json.{0,10}(parse|syntax)|unexpected token|unexpected end of/.test(lower)) return 'json_parse'
  if (/econnrefused|enotfound|fetch failed|network|connection.{0,10}(reset|aborted|closed)/.test(lower)) {
    return 'network'
  }
  if (/cancel|abort/.test(lower)) return 'cancelled'

  return 'other'
}

// ============================================================
// 共用 helper
// ============================================================

/**
 * 计算给定数组的百分位数。
 * - p 取值 0..100；
 * - 空数组返回 0；
 * - 使用 "nearest-rank" 算法，简单、稳定，对 p95/p99 足够准。
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  if (p <= 0) return Math.min(...values)
  if (p >= 100) return Math.max(...values)
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))]
}

/** 判断一条记录是否算"失败"。规则：status === 'error'。 */
function isFailure(r: HealthAuditRecord): boolean {
  return r.status === 'error'
}

/** AI_* 前缀的 action 才纳入"健康监控"。其它操作（CRUD、登录等）不算 AI 调用。 */
export function isAiAction(action: string): boolean {
  return action.startsWith('AI_')
}

function getDuration(r: HealthAuditRecord): number | null {
  return typeof r.durationMs === 'number' && r.durationMs >= 0 ? r.durationMs : null
}

function getDate(r: HealthAuditRecord): Date {
  return r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)
}

// ============================================================
// 1. 按操作类型分组
// ============================================================

export interface ByActionSummary {
  action: string
  total: number
  success: number
  failed: number
  successRate: number   // 0..1
  avgDurationMs: number // 仅基于有 durationMs 的记录
  p95DurationMs: number
  avgTokenIn: number
  avgTokenOut: number
}

/**
 * 把记录按 action 分桶，每组算 total / success / failed / 平均耗时 / p95 / 平均 token。
 * - 只统计 AI_* 前缀的 action
 * - 输出按 total 降序
 */
export function summarizeByAction(records: readonly HealthAuditRecord[]): ByActionSummary[] {
  const grouped = new Map<string, HealthAuditRecord[]>()
  for (const r of records) {
    if (!isAiAction(r.action)) continue
    const list = grouped.get(r.action) ?? []
    list.push(r)
    grouped.set(r.action, list)
  }

  const summaries: ByActionSummary[] = []
  for (const [action, list] of grouped) {
    const failed = list.filter(isFailure).length
    const success = list.length - failed
    const durations = list.map(getDuration).filter((d): d is number => d !== null)
    const tokensIn = list
      .map(r => (typeof r.tokenInput === 'number' ? r.tokenInput : null))
      .filter((v): v is number => v !== null)
    const tokensOut = list
      .map(r => (typeof r.tokenOutput === 'number' ? r.tokenOutput : null))
      .filter((v): v is number => v !== null)
    summaries.push({
      action,
      total: list.length,
      success,
      failed,
      successRate: list.length === 0 ? 0 : success / list.length,
      avgDurationMs: durations.length === 0
        ? 0
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p95DurationMs: Math.round(percentile(durations, 95)),
      avgTokenIn: tokensIn.length === 0
        ? 0
        : Math.round(tokensIn.reduce((a, b) => a + b, 0) / tokensIn.length),
      avgTokenOut: tokensOut.length === 0
        ? 0
        : Math.round(tokensOut.reduce((a, b) => a + b, 0) / tokensOut.length),
    })
  }

  return summaries.sort((a, b) => b.total - a.total)
}

// ============================================================
// 2. 失败原因分类
// ============================================================

export interface FailureCategorySummary {
  category: FailureCategory
  label: string
  count: number
  /** 取最多 3 个原文错误样本，供 admin 排查时点开看。 */
  samples: string[]
}

/**
 * 把所有 status='error' 的记录按 categorizeError 分桶。
 * 输出按 count 降序，最多取 3 个原文样本。
 */
export function summarizeFailures(records: readonly HealthAuditRecord[]): FailureCategorySummary[] {
  const grouped = new Map<FailureCategory, { count: number; samples: string[] }>()
  for (const r of records) {
    if (!isFailure(r)) continue
    const cat = categorizeError(r.error)
    const bucket = grouped.get(cat) ?? { count: 0, samples: [] }
    bucket.count += 1
    if (bucket.samples.length < 3 && r.error) {
      // 截断单条样本到 200 字符，避免敏感大对象进前端
      const trimmed = r.error.length > 200 ? r.error.slice(0, 200) + '…' : r.error
      if (!bucket.samples.includes(trimmed)) bucket.samples.push(trimmed)
    }
    grouped.set(cat, bucket)
  }

  return Array.from(grouped.entries())
    .map(([category, { count, samples }]) => ({
      category,
      label: FAILURE_CATEGORY_LABELS[category],
      count,
      samples,
    }))
    .sort((a, b) => b.count - a.count)
}

// ============================================================
// 3. 延迟分布
// ============================================================

export interface LatencyBucket {
  /** 桶范围下界，包含。单位 ms。 */
  fromMs: number
  /** 桶范围上界，不含。null 表示开区间（即"大于 fromMs"）。 */
  toMs: number | null
  label: string
  count: number
}

const LATENCY_BUCKETS: ReadonlyArray<Omit<LatencyBucket, 'count'>> = [
  { fromMs: 0,      toMs: 1000,    label: '< 1s' },
  { fromMs: 1000,   toMs: 3000,    label: '1–3s' },
  { fromMs: 3000,   toMs: 10000,   label: '3–10s' },
  { fromMs: 10000,  toMs: 30000,   label: '10–30s' },
  { fromMs: 30000,  toMs: null,    label: '≥ 30s' },
]

/**
 * 把记录按 durationMs 分到 5 个桶里。
 * - 仅统计 AI_* action 且 durationMs 非空
 */
export function summarizeLatencyDistribution(records: readonly HealthAuditRecord[]): LatencyBucket[] {
  const buckets = LATENCY_BUCKETS.map(b => ({ ...b, count: 0 }))
  for (const r of records) {
    if (!isAiAction(r.action)) continue
    const d = getDuration(r)
    if (d === null) continue
    for (const b of buckets) {
      if (d >= b.fromMs && (b.toMs === null || d < b.toMs)) {
        b.count += 1
        break
      }
    }
  }
  return buckets
}

// ============================================================
// 4. 24h 趋势（按小时分桶）
// ============================================================

export interface HourBucket {
  /** 桶的起始时间（整点，UTC ISO 字符串） */
  hourStart: string
  total: number
  success: number
  failed: number
}

/**
 * 把 [from, to] 内的记录按整小时分桶。
 * - 桶数 = ceil((to-from)/3600_000)
 * - 总返回桶按时间升序
 * - 只统计 AI_* action
 */
export function summarizeHourlyTrend(
  records: readonly HealthAuditRecord[],
  from: Date,
  to: Date,
): HourBucket[] {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  if (toMs <= fromMs) return []

  // 把 from 对齐到整点（向下）
  const startMs = Math.floor(fromMs / 3600_000) * 3600_000
  const buckets: HourBucket[] = []
  for (let t = startMs; t < toMs; t += 3600_000) {
    buckets.push({
      hourStart: new Date(t).toISOString(),
      total: 0,
      success: 0,
      failed: 0,
    })
  }

  for (const r of records) {
    if (!isAiAction(r.action)) continue
    const t = getDate(r).getTime()
    if (t < startMs || t >= toMs) continue
    const idx = Math.floor((t - startMs) / 3600_000)
    if (idx < 0 || idx >= buckets.length) continue
    const b = buckets[idx]
    b.total += 1
    if (isFailure(r)) b.failed += 1
    else b.success += 1
  }

  return buckets
}

// ============================================================
// 5. 用户 AI 调用排行
// ============================================================

export interface UserRanking {
  userId: string
  username: string
  total: number
  success: number
  failed: number
  successRate: number
  totalTokens: number
}

/**
 * 把记录按 userId 分组，统计每个用户的 AI 调用情况。
 * - 只统计 AI_* action
 * - 输出按 total 降序，至多 limit 条（默认 10）
 * - userId 为 null（匿名/已删除用户）合并到一个 'anonymous' 分组
 */
export function summarizeUserRanking(
  records: readonly HealthAuditRecord[],
  limit: number = 10,
): UserRanking[] {
  const grouped = new Map<string, { records: HealthAuditRecord[]; username: string }>()
  for (const r of records) {
    if (!isAiAction(r.action)) continue
    const key = r.userId ?? 'anonymous'
    const bucket = grouped.get(key) ?? {
      records: [],
      username: r.user?.username ?? (r.userId ? '（已删除）' : '匿名'),
    }
    bucket.records.push(r)
    // 用户名以最新出现的为准
    if (r.user?.username) bucket.username = r.user.username
    grouped.set(key, bucket)
  }

  const rankings: UserRanking[] = []
  for (const [userId, { records: list, username }] of grouped) {
    const failed = list.filter(isFailure).length
    const success = list.length - failed
    const totalTokens = list.reduce(
      (sum, r) =>
        sum
        + (typeof r.tokenInput === 'number' ? r.tokenInput : 0)
        + (typeof r.tokenOutput === 'number' ? r.tokenOutput : 0),
      0,
    )
    rankings.push({
      userId,
      username,
      total: list.length,
      success,
      failed,
      successRate: list.length === 0 ? 0 : success / list.length,
      totalTokens,
    })
  }

  return rankings.sort((a, b) => b.total - a.total).slice(0, limit)
}

// ============================================================
// 入口：聚合全部 5 个视角
// ============================================================

export interface HealthSummary {
  window: { from: string; to: string; hours: number }
  totals: {
    aiCallsTotal: number
    aiCallsSuccess: number
    aiCallsFailed: number
    aiCallsSuccessRate: number
    avgDurationMs: number
    p95DurationMs: number
    p99DurationMs: number
    totalTokenInput: number
    totalTokenOutput: number
  }
  byAction: ByActionSummary[]
  failures: FailureCategorySummary[]
  latency: LatencyBucket[]
  hourlyTrend: HourBucket[]
  userRanking: UserRanking[]
}

/**
 * 入口：调用方传入记录 + 时间窗 + 期望的用户排行长度，得到完整 HealthSummary。
 */
export function buildHealthSummary(
  records: readonly HealthAuditRecord[],
  from: Date,
  to: Date,
  userRankingLimit: number = 10,
): HealthSummary {
  const aiRecords = records.filter(r => isAiAction(r.action))
  const failed = aiRecords.filter(isFailure).length
  const success = aiRecords.length - failed
  const durations = aiRecords.map(getDuration).filter((d): d is number => d !== null)
  const totalTokenInput = aiRecords.reduce(
    (s, r) => s + (typeof r.tokenInput === 'number' ? r.tokenInput : 0),
    0,
  )
  const totalTokenOutput = aiRecords.reduce(
    (s, r) => s + (typeof r.tokenOutput === 'number' ? r.tokenOutput : 0),
    0,
  )

  return {
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      hours: Math.round((to.getTime() - from.getTime()) / 3600_000),
    },
    totals: {
      aiCallsTotal: aiRecords.length,
      aiCallsSuccess: success,
      aiCallsFailed: failed,
      aiCallsSuccessRate: aiRecords.length === 0 ? 0 : success / aiRecords.length,
      avgDurationMs: durations.length === 0
        ? 0
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p95DurationMs: Math.round(percentile(durations, 95)),
      p99DurationMs: Math.round(percentile(durations, 99)),
      totalTokenInput,
      totalTokenOutput,
    },
    byAction: summarizeByAction(records),
    failures: summarizeFailures(records),
    latency: summarizeLatencyDistribution(records),
    hourlyTrend: summarizeHourlyTrend(records, from, to),
    userRanking: summarizeUserRanking(records, userRankingLimit),
  }
}
