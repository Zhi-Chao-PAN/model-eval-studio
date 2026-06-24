import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assessHealthAlertLevel,
  HEALTH_ALERT_THRESHOLDS,
  type AssessableSummary,
} from './health-alert.js'

// ----- helpers -----------------------------------------------------------

function sum(opts: Partial<AssessableSummary> = {}): AssessableSummary {
  return {
    totals: {
      aiCallsTotal: 0,
      aiCallsFailed: 0,
      aiCallsSuccessRate: 1,
      p95DurationMs: 0,
      ...opts.totals,
    },
    failures: opts.failures ?? [],
  }
}

// ============================================================
// assessHealthAlertLevel
// ============================================================

test('assessHealthAlertLevel: null 输入返回 null', () => {
  assert.equal(assessHealthAlertLevel(null), null)
})

test('assessHealthAlertLevel: 无调用返回 null', () => {
  assert.equal(assessHealthAlertLevel(sum({ totals: { aiCallsTotal: 0, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 0 } })), null)
})

test('assessHealthAlertLevel: 全部成功返回 null', () => {
  const r = assessHealthAlertLevel(sum({ totals: { aiCallsTotal: 100, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 5000 } }))
  assert.equal(r, null)
})

// ----- critical ---------------------------------------------------------

test('assessHealthAlertLevel: 失败率 100% 且 50 次调用 → critical', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 50, aiCallsFailed: 50, aiCallsSuccessRate: 0, p95DurationMs: 0 },
  }))
  assert.equal(r?.level, 'critical')
  assert.match(r?.message ?? '', /100%/)
  assert.match(r?.message ?? '', /50 \/ 50/)
})

test('assessHealthAlertLevel: 失败率 50% 但 < 10 次 → 不报 critical（兜底生效）', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 5, aiCallsFailed: 3, aiCallsSuccessRate: 0.4, p95DurationMs: 0 },
  }))
  // 5 次调用 < 10 次，不应触发 critical
  assert.notEqual(r?.level, 'critical')
})

test('assessHealthAlertLevel: 失败率 60% 且 20 次调用 → critical', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 20, aiCallsFailed: 12, aiCallsSuccessRate: 0.4, p95DurationMs: 0 },
  }))
  assert.equal(r?.level, 'critical')
  assert.match(r?.message ?? '', /60%/)
})

// ----- warn -------------------------------------------------------------

test('assessHealthAlertLevel: 失败率 30% 且 100 次调用 → warn（不是 critical）', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 100, aiCallsFailed: 30, aiCallsSuccessRate: 0.7, p95DurationMs: 5000 },
  }))
  assert.equal(r?.level, 'warn')
  assert.match(r?.message ?? '', /30%/)
})

test('assessHealthAlertLevel: P95 = 90s → warn', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 50, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 90_000 },
  }))
  assert.equal(r?.level, 'warn')
  assert.match(r?.message ?? '', /P95/)
  assert.match(r?.message ?? '', /90s/)
})

test('assessHealthAlertLevel: P95 = 50s 不触发 warn', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 50, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 50_000 },
  }))
  assert.equal(r, null)
})

// ----- info -------------------------------------------------------------

test('assessHealthAlertLevel: 限流 5 次 → info', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 50, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 5000 },
    failures: [{ category: 'rate_limit', count: 5 }],
  }))
  assert.equal(r?.level, 'info')
  assert.match(r?.message ?? '', /429/)
  assert.match(r?.message ?? '', /5 次/)
})

test('assessHealthAlertLevel: 限流 2 次不触发 info（兜底）', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 50, aiCallsFailed: 0, aiCallsSuccessRate: 1, p95DurationMs: 5000 },
    failures: [{ category: 'rate_limit', count: 2 }],
  }))
  assert.equal(r, null)
})

// ----- 优先级 -----------------------------------------------------------

test('assessHealthAlertLevel: critical 优先级最高（同时满足 crit+warn 条件时返回 critical）', () => {
  // 失败率 80% 且 P95 90s：同时满足 critical 和 P95 warn
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 100, aiCallsFailed: 80, aiCallsSuccessRate: 0.2, p95DurationMs: 90_000 },
  }))
  assert.equal(r?.level, 'critical')
})

test('assessHealthAlertLevel: 失败率 warn 触发时，info 不会覆盖 warn', () => {
  // 失败率 25% + 限流 5 次：按严重度返回 warn
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 100, aiCallsFailed: 25, aiCallsSuccessRate: 0.75, p95DurationMs: 5000 },
    failures: [{ category: 'rate_limit', count: 5 }],
  }))
  assert.equal(r?.level, 'warn')
})

// ----- 边界 -------------------------------------------------------------

test('assessHealthAlertLevel: 失败率恰好 50% 且 10 次 → critical（边界包含）', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 10, aiCallsFailed: 5, aiCallsSuccessRate: 0.5, p95DurationMs: 0 },
  }))
  assert.equal(r?.level, 'critical')
})

test('assessHealthAlertLevel: 失败率恰好 20% 且 100 次 → warn（边界包含）', () => {
  const r = assessHealthAlertLevel(sum({
    totals: { aiCallsTotal: 100, aiCallsFailed: 20, aiCallsSuccessRate: 0.8, p95DurationMs: 0 },
  }))
  assert.equal(r?.level, 'warn')
})

// ----- 阈值导出 ---------------------------------------------------------

test('HEALTH_ALERT_THRESHOLDS: 暴露给调用方可调，结构稳定', () => {
  // 此处只防止误改字段名；具体数值不冻结
  assert.equal(typeof HEALTH_ALERT_THRESHOLDS.critical.minFailedRate, 'number')
  assert.equal(typeof HEALTH_ALERT_THRESHOLDS.critical.minTotalCalls, 'number')
  assert.equal(typeof HEALTH_ALERT_THRESHOLDS.warn.failedRateLow, 'number')
  assert.equal(typeof HEALTH_ALERT_THRESHOLDS.warn.p95SlowMs, 'number')
  assert.equal(typeof HEALTH_ALERT_THRESHOLDS.info.rateLimitMin, 'number')
})
