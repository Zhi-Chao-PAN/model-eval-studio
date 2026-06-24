import test from 'node:test'
import assert from 'node:assert/strict'

import {
  categorizeError,
  percentile,
  isAiAction,
  summarizeByAction,
  summarizeFailures,
  summarizeLatencyDistribution,
  summarizeHourlyTrend,
  summarizeUserRanking,
  buildHealthSummary,
  type HealthAuditRecord,
} from './admin-health.js'

// ----- helpers -----------------------------------------------------------

function rec(opts: Partial<HealthAuditRecord> & { action: string }): HealthAuditRecord {
  return {
    action: opts.action,
    status: opts.status ?? 'success',
    error: opts.error ?? null,
    durationMs: opts.durationMs ?? null,
    tokenInput: opts.tokenInput ?? null,
    tokenOutput: opts.tokenOutput ?? null,
    createdAt: opts.createdAt ?? new Date('2026-06-24T00:00:00Z'),
    userId: opts.userId ?? null,
    user: opts.user ?? null,
  }
}

// ============================================================
// categorizeError
// ============================================================

test('categorizeError: 空输入返回 other', () => {
  assert.equal(categorizeError(null), 'other')
  assert.equal(categorizeError(''), 'other')
  assert.equal(categorizeError(undefined), 'other')
})

test('categorizeError: timeout 各种写法都命中', () => {
  assert.equal(categorizeError('Request timeout'), 'timeout')
  assert.equal(categorizeError('upstream timed out'), 'timeout')
  assert.equal(categorizeError('ESOCKETTIMEDOUT'), 'timeout')
  assert.equal(categorizeError('deadline exceeded by 10s'), 'timeout')
})

test('categorizeError: 429 / rate limit', () => {
  assert.equal(categorizeError('429 Too Many Requests'), 'rate_limit')
  assert.equal(categorizeError('rate-limit hit on tier 2'), 'rate_limit')
})

test('categorizeError: 401 / 403 / 鉴权关键词', () => {
  assert.equal(categorizeError('HTTP 401 from upstream'), 'auth')
  assert.equal(categorizeError('Forbidden'), 'auth')
  assert.equal(categorizeError('Invalid API Key'), 'auth')
  assert.equal(categorizeError('Incorrect API key provided'), 'auth')
})

test('categorizeError: 5xx 服务端错误', () => {
  assert.equal(categorizeError('502 Bad Gateway'), 'server_error')
  assert.equal(categorizeError('503 Service Unavailable'), 'server_error')
  assert.equal(categorizeError('Internal server error'), 'server_error')
})

test('categorizeError: token 限制', () => {
  assert.equal(categorizeError('token limit exceeded'), 'token_limit')
  assert.equal(categorizeError('Maximum context length is 32k tokens'), 'token_limit')
})

test('categorizeError: JSON 解析', () => {
  assert.equal(categorizeError('Unexpected token < in JSON at position 0'), 'json_parse')
  assert.equal(categorizeError('JSON syntax error near eof'), 'json_parse')
})

test('categorizeError: 网络错误', () => {
  assert.equal(categorizeError('ECONNREFUSED'), 'network')
  assert.equal(categorizeError('ENOTFOUND api.example.com'), 'network')
  assert.equal(categorizeError('fetch failed'), 'network')
  assert.equal(categorizeError('connection reset by peer'), 'network')
})

test('categorizeError: 取消', () => {
  assert.equal(categorizeError('Request was cancelled'), 'cancelled')
  assert.equal(categorizeError('aborted'), 'cancelled')
})

test('categorizeError: 优先级——timeout 优先于 429', () => {
  // 同时含 timeout 与 429：按代码顺序 timeout 先匹配
  assert.equal(categorizeError('Request timed out (429 in retry)'), 'timeout')
})

test('categorizeError: 完全无规律的错误归 other', () => {
  assert.equal(categorizeError('Something blew up in production'), 'other')
})

// ============================================================
// percentile
// ============================================================

test('percentile: 空数组返回 0', () => {
  assert.equal(percentile([], 50), 0)
  assert.equal(percentile([], 95), 0)
})

test('percentile: 单元素，任何分位都返回它', () => {
  assert.equal(percentile([42], 50), 42)
  assert.equal(percentile([42], 95), 42)
})

test('percentile: p=0 返回最小值，p=100 返回最大值', () => {
  assert.equal(percentile([1, 5, 9, 13, 17], 0), 1)
  assert.equal(percentile([1, 5, 9, 13, 17], 100), 17)
})

test('percentile: 中位数 50%', () => {
  assert.equal(percentile([1, 5, 9, 13, 17], 50), 9)
})

test('percentile: p95 nearest-rank', () => {
  // 100 个元素 1..100，p95 → rank=95，第 95 个值 = 95
  const arr = Array.from({ length: 100 }, (_, i) => i + 1)
  assert.equal(percentile(arr, 95), 95)
  assert.equal(percentile(arr, 99), 99)
})

test('percentile: 乱序输入也正确', () => {
  assert.equal(percentile([17, 1, 13, 5, 9], 50), 9)
})

// ============================================================
// isAiAction
// ============================================================

test('isAiAction: AI_* 前缀才是 AI 调用', () => {
  assert.equal(isAiAction('AI_REPORT_GENERATE'), true)
  assert.equal(isAiAction('AI_CHAT'), true)
  assert.equal(isAiAction('LOGIN'), false)
  assert.equal(isAiAction('TASK_CREATE'), false)
})

// ============================================================
// summarizeByAction
// ============================================================

test('summarizeByAction: 非 AI action 被忽略', () => {
  const result = summarizeByAction([
    rec({ action: 'LOGIN' }),
    rec({ action: 'TASK_CREATE' }),
  ])
  assert.deepEqual(result, [])
})

test('summarizeByAction: 成功率 / 失败 / 平均耗时正确', () => {
  const records = [
    rec({ action: 'AI_CHAT', status: 'success', durationMs: 1000 }),
    rec({ action: 'AI_CHAT', status: 'success', durationMs: 2000 }),
    rec({ action: 'AI_CHAT', status: 'success', durationMs: 3000 }),
    rec({ action: 'AI_CHAT', status: 'error', durationMs: 500, error: 'timeout' }),
  ]
  const result = summarizeByAction(records)
  assert.equal(result.length, 1)
  assert.equal(result[0].action, 'AI_CHAT')
  assert.equal(result[0].total, 4)
  assert.equal(result[0].success, 3)
  assert.equal(result[0].failed, 1)
  assert.equal(result[0].successRate, 0.75)
  // (1000+2000+3000+500)/4 = 1625
  assert.equal(result[0].avgDurationMs, 1625)
})

test('summarizeByAction: 多 action 按 total 降序', () => {
  const records = [
    rec({ action: 'AI_CHAT' }),
    rec({ action: 'AI_REPORT_GENERATE' }),
    rec({ action: 'AI_REPORT_GENERATE' }),
    rec({ action: 'AI_REPORT_GENERATE' }),
  ]
  const result = summarizeByAction(records)
  assert.equal(result[0].action, 'AI_REPORT_GENERATE')
  assert.equal(result[0].total, 3)
  assert.equal(result[1].action, 'AI_CHAT')
})

test('summarizeByAction: 无 token 字段时平均 token = 0', () => {
  const result = summarizeByAction([rec({ action: 'AI_CHAT' })])
  assert.equal(result[0].avgTokenIn, 0)
  assert.equal(result[0].avgTokenOut, 0)
})

// ============================================================
// summarizeFailures
// ============================================================

test('summarizeFailures: 只统计 error 状态的记录', () => {
  const result = summarizeFailures([
    rec({ action: 'AI_CHAT', status: 'success', error: 'timeout' }), // 不算
    rec({ action: 'AI_CHAT', status: 'error', error: 'timeout' }),
    rec({ action: 'AI_CHAT', status: 'error', error: '429 Too Many Requests' }),
  ])
  const total = result.reduce((s, r) => s + r.count, 0)
  assert.equal(total, 2)
})

test('summarizeFailures: 按 count 降序', () => {
  const records = [
    rec({ action: 'AI_CHAT', status: 'error', error: 'timeout 1' }),
    rec({ action: 'AI_CHAT', status: 'error', error: 'timeout 2' }),
    rec({ action: 'AI_CHAT', status: 'error', error: 'timeout 3' }),
    rec({ action: 'AI_CHAT', status: 'error', error: '429 rate limit' }),
  ]
  const result = summarizeFailures(records)
  assert.equal(result[0].category, 'timeout')
  assert.equal(result[0].count, 3)
  assert.equal(result[1].category, 'rate_limit')
})

test('summarizeFailures: 最多保留 3 个样本', () => {
  const records = Array.from({ length: 10 }, (_, i) =>
    rec({ action: 'AI_CHAT', status: 'error', error: `timeout ${i}` }),
  )
  const result = summarizeFailures(records)
  assert.equal(result[0].samples.length, 3)
})

test('summarizeFailures: 样本超长被截断', () => {
  const longError = 'timeout: ' + 'x'.repeat(500)
  const result = summarizeFailures([
    rec({ action: 'AI_CHAT', status: 'error', error: longError }),
  ])
  assert.ok(result[0].samples[0].length <= 201)
  assert.ok(result[0].samples[0].endsWith('…'))
})

// ============================================================
// summarizeLatencyDistribution
// ============================================================

test('summarizeLatencyDistribution: 5 个桶都存在', () => {
  const result = summarizeLatencyDistribution([])
  assert.equal(result.length, 5)
  assert.equal(result[0].label, '< 1s')
  assert.equal(result[4].label, '≥ 30s')
  for (const b of result) assert.equal(b.count, 0)
})

test('summarizeLatencyDistribution: 边界值分桶正确', () => {
  const records = [
    rec({ action: 'AI_CHAT', durationMs: 0 }),       // < 1s
    rec({ action: 'AI_CHAT', durationMs: 999 }),     // < 1s
    rec({ action: 'AI_CHAT', durationMs: 1000 }),    // 1-3s
    rec({ action: 'AI_CHAT', durationMs: 2999 }),    // 1-3s
    rec({ action: 'AI_CHAT', durationMs: 3000 }),    // 3-10s
    rec({ action: 'AI_CHAT', durationMs: 9999 }),    // 3-10s
    rec({ action: 'AI_CHAT', durationMs: 10000 }),   // 10-30s
    rec({ action: 'AI_CHAT', durationMs: 29999 }),   // 10-30s
    rec({ action: 'AI_CHAT', durationMs: 30000 }),   // ≥ 30s
    rec({ action: 'AI_CHAT', durationMs: 120_000 }), // ≥ 30s
  ]
  const result = summarizeLatencyDistribution(records)
  assert.equal(result[0].count, 2) // < 1s
  assert.equal(result[1].count, 2) // 1-3s
  assert.equal(result[2].count, 2) // 3-10s
  assert.equal(result[3].count, 2) // 10-30s
  assert.equal(result[4].count, 2) // ≥ 30s
})

test('summarizeLatencyDistribution: null duration 被忽略', () => {
  const records = [
    rec({ action: 'AI_CHAT', durationMs: null }),
    rec({ action: 'AI_CHAT', durationMs: 500 }),
  ]
  const result = summarizeLatencyDistribution(records)
  assert.equal(result[0].count, 1)
})

test('summarizeLatencyDistribution: 非 AI action 被忽略', () => {
  const result = summarizeLatencyDistribution([
    rec({ action: 'LOGIN', durationMs: 500 }),
  ])
  for (const b of result) assert.equal(b.count, 0)
})

// ============================================================
// summarizeHourlyTrend
// ============================================================

test('summarizeHourlyTrend: from >= to 返回空数组', () => {
  const t = new Date('2026-06-24T00:00:00Z')
  assert.deepEqual(summarizeHourlyTrend([], t, t), [])
})

test('summarizeHourlyTrend: 桶数 = 时间窗内的整小时数', () => {
  const from = new Date('2026-06-24T00:00:00Z')
  const to = new Date('2026-06-24T03:00:00Z')
  const result = summarizeHourlyTrend([], from, to)
  assert.equal(result.length, 3)
  assert.equal(result[0].hourStart, '2026-06-24T00:00:00.000Z')
  assert.equal(result[2].hourStart, '2026-06-24T02:00:00.000Z')
})

test('summarizeHourlyTrend: 记录按时间落入正确桶', () => {
  const from = new Date('2026-06-24T00:00:00Z')
  const to = new Date('2026-06-24T03:00:00Z')
  const records = [
    rec({ action: 'AI_CHAT', createdAt: new Date('2026-06-24T00:15:00Z') }),
    rec({ action: 'AI_CHAT', createdAt: new Date('2026-06-24T00:45:00Z'), status: 'error' }),
    rec({ action: 'AI_CHAT', createdAt: new Date('2026-06-24T02:30:00Z') }),
  ]
  const result = summarizeHourlyTrend(records, from, to)
  assert.equal(result[0].total, 2)
  assert.equal(result[0].success, 1)
  assert.equal(result[0].failed, 1)
  assert.equal(result[1].total, 0)
  assert.equal(result[2].total, 1)
  assert.equal(result[2].success, 1)
})

test('summarizeHourlyTrend: 范围外记录被忽略', () => {
  const from = new Date('2026-06-24T00:00:00Z')
  const to = new Date('2026-06-24T03:00:00Z')
  const records = [
    rec({ action: 'AI_CHAT', createdAt: new Date('2026-06-23T23:30:00Z') }),
    rec({ action: 'AI_CHAT', createdAt: new Date('2026-06-24T04:00:00Z') }),
  ]
  const result = summarizeHourlyTrend(records, from, to)
  for (const b of result) assert.equal(b.total, 0)
})

// ============================================================
// summarizeUserRanking
// ============================================================

test('summarizeUserRanking: 按 total 降序，最多 N 条', () => {
  const records = [
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'alice' } }),
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'alice' } }),
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'alice' } }),
    rec({ action: 'AI_CHAT', userId: 'u2', user: { username: 'bob' } }),
  ]
  const result = summarizeUserRanking(records, 10)
  assert.equal(result.length, 2)
  assert.equal(result[0].username, 'alice')
  assert.equal(result[0].total, 3)
  assert.equal(result[1].username, 'bob')
})

test('summarizeUserRanking: 限制条数', () => {
  const records = Array.from({ length: 15 }, (_, i) =>
    rec({ action: 'AI_CHAT', userId: 'u' + i, user: { username: 'user' + i } }),
  )
  const result = summarizeUserRanking(records, 5)
  assert.equal(result.length, 5)
})

test('summarizeUserRanking: userId 为 null 归 anonymous 桶', () => {
  const records = [
    rec({ action: 'AI_CHAT', userId: null }),
    rec({ action: 'AI_CHAT', userId: null }),
  ]
  const result = summarizeUserRanking(records, 10)
  assert.equal(result.length, 1)
  assert.equal(result[0].userId, 'anonymous')
  assert.equal(result[0].total, 2)
})

test('summarizeUserRanking: 累计 token 正确', () => {
  const records = [
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'a' }, tokenInput: 100, tokenOutput: 50 }),
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'a' }, tokenInput: 200, tokenOutput: 75 }),
  ]
  const result = summarizeUserRanking(records, 10)
  assert.equal(result[0].totalTokens, 100 + 50 + 200 + 75)
})

test('summarizeUserRanking: 失败率正确', () => {
  const records = [
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'a' }, status: 'success' }),
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'a' }, status: 'success' }),
    rec({ action: 'AI_CHAT', userId: 'u1', user: { username: 'a' }, status: 'error', error: 'timeout' }),
  ]
  const result = summarizeUserRanking(records, 10)
  assert.equal(result[0].successRate, 2 / 3)
})

// ============================================================
// buildHealthSummary 入口
// ============================================================

test('buildHealthSummary: 空记录返回零值结构', () => {
  const from = new Date('2026-06-24T00:00:00Z')
  const to = new Date('2026-06-25T00:00:00Z')
  const r = buildHealthSummary([], from, to)
  assert.equal(r.totals.aiCallsTotal, 0)
  assert.equal(r.totals.aiCallsSuccessRate, 0)
  assert.equal(r.totals.p95DurationMs, 0)
  assert.deepEqual(r.byAction, [])
  assert.deepEqual(r.failures, [])
  assert.equal(r.latency.length, 5) // 5 个桶始终存在
  assert.equal(r.hourlyTrend.length, 24) // 24h 窗
  assert.deepEqual(r.userRanking, [])
})

test('buildHealthSummary: 综合统计正确', () => {
  const from = new Date('2026-06-24T00:00:00Z')
  const to = new Date('2026-06-25T00:00:00Z')
  const records = [
    rec({ action: 'AI_CHAT', durationMs: 1000, tokenInput: 100, tokenOutput: 50,
          createdAt: new Date('2026-06-24T05:00:00Z') }),
    rec({ action: 'AI_REPORT_GENERATE', durationMs: 5000,
          createdAt: new Date('2026-06-24T06:00:00Z') }),
    rec({ action: 'AI_CHAT', status: 'error', error: 'timeout',
          createdAt: new Date('2026-06-24T07:00:00Z') }),
    rec({ action: 'LOGIN' }), // 不算
  ]
  const r = buildHealthSummary(records, from, to)
  assert.equal(r.totals.aiCallsTotal, 3)
  assert.equal(r.totals.aiCallsSuccess, 2)
  assert.equal(r.totals.aiCallsFailed, 1)
  assert.equal(r.totals.totalTokenInput, 100)
  assert.equal(r.totals.totalTokenOutput, 50)
  assert.equal(r.byAction.length, 2)
  assert.equal(r.failures.length, 1)
  assert.equal(r.failures[0].category, 'timeout')
  assert.equal(r.window.hours, 24)
})
