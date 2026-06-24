/**
 * 健康预警等级评估（纯函数）。
 *
 * 输入：buildHealthSummary 的输出（1h 窗口的子集）。
 * 输出：3 个等级之一 + 1 句人类可读的话。null 表示"一切正常，无需展示"。
 *
 * 设计原则：
 * - 3 个等级按严重度从低到高：info < warn < critical。
 * - 同一窗口内多个条件同时命中，返回**最高**等级。
 * - 关键阈值带"绝对值兜底"——避免小流量项目启动时被几条早期错误误报。
 *
 * 阈值是经验值，需要 admin 在生产里观察几周后调（见报告 §10 遗留）。
 */

export type HealthAlertLevel = 'info' | 'warn' | 'critical'

export interface HealthAlert {
  level: HealthAlertLevel
  message: string
}

export interface AssessableSummary {
  totals: {
    aiCallsTotal: number
    aiCallsFailed: number
    aiCallsSuccessRate: number
    p95DurationMs: number
  }
  failures: Array<{ category: string; count: number }>
}

export const HEALTH_ALERT_THRESHOLDS = {
  critical: {
    /** 失败率阈值（含） */
    minFailedRate: 0.5,
    /** 触发 critical 至少需要的调用数 */
    minTotalCalls: 10,
  },
  warn: {
    /** 失败率 warn 下限（不含 critical；含此值） */
    failedRateLow: 0.2,
    /** P95 耗时（ms），超过此值进入 warn */
    p95SlowMs: 60_000,
  },
  info: {
    /** 限流 429 出现次数阈值 */
    rateLimitMin: 3,
  },
} as const

/**
 * 评估给定健康摘要，返回 { level, message } 或 null。
 *
 * 关键不变量：
 * - aiCallsTotal === 0 → null（无数据不报警）
 * - 三个等级条件**互不抑制**——多次命中也只返回最高级（UI 只展示一行）
 * - message 至少包含一个量化指标
 *
 * 浮点容差：`1 - 0.8 === 0.19999999999999996`，在阈值 0.2 边界上 `>=` 会失败。
 * 引入 1e-9 容差让阈值比较稳定，不会因浮点误差误判。
 */
function geWithTolerance(a: number, b: number): boolean {
  return a >= b - 1e-9
}

export function assessHealthAlertLevel(summary: AssessableSummary | null): HealthAlert | null {
  if (!summary) return null
  const { totals, failures } = summary
  if (totals.aiCallsTotal === 0) return null

  const failedRate = 1 - totals.aiCallsSuccessRate

  // critical：失败率 ≥ 50% 且 ≥ 10 次调用
  if (
    geWithTolerance(failedRate, HEALTH_ALERT_THRESHOLDS.critical.minFailedRate)
    && totals.aiCallsTotal >= HEALTH_ALERT_THRESHOLDS.critical.minTotalCalls
  ) {
    return {
      level: 'critical',
      message: `AI 服务可能出现严重问题：最近 1h 失败率 ${(failedRate * 100).toFixed(0)}%（${totals.aiCallsFailed} / ${totals.aiCallsTotal}）`,
    }
  }

  // warn：失败率 ≥ 20% 或 P95 > 60s
  if (geWithTolerance(failedRate, HEALTH_ALERT_THRESHOLDS.warn.failedRateLow)) {
    return {
      level: 'warn',
      message: `AI 失败率上升：最近 1h ${(failedRate * 100).toFixed(0)}%（${totals.aiCallsFailed} / ${totals.aiCallsTotal}）`,
    }
  }
  if (totals.p95DurationMs > HEALTH_ALERT_THRESHOLDS.warn.p95SlowMs) {
    const seconds = (totals.p95DurationMs / 1000).toFixed(0)
    return {
      level: 'warn',
      message: `AI 调用 P95 耗时偏长：${seconds}s`,
    }
  }

  // info：限流 ≥ 3 次
  const rateLimit = failures.find(f => f.category === 'rate_limit')
  if (rateLimit && rateLimit.count >= HEALTH_ALERT_THRESHOLDS.info.rateLimitMin) {
    return {
      level: 'info',
      message: `上游限流中：最近 1h 出现 ${rateLimit.count} 次 429`,
    }
  }

  return null
}
