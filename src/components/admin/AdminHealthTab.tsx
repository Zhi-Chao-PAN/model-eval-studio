'use client'
import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, BarChart3, Clock, Gauge, Loader2,
  RefreshCw, TrendingUp, Users, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================
// 类型（与 src/lib/admin-health.ts 的 HealthSummary 对齐）
// ============================================================

interface ByActionSummary {
  action: string
  total: number
  success: number
  failed: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
  avgTokenIn: number
  avgTokenOut: number
}
interface FailureCategorySummary {
  category: string
  label: string
  count: number
  samples: string[]
}
interface LatencyBucket {
  fromMs: number
  toMs: number | null
  label: string
  count: number
}
interface HourBucket {
  hourStart: string
  total: number
  success: number
  failed: number
}
interface UserRanking {
  userId: string
  username: string
  total: number
  success: number
  failed: number
  successRate: number
  totalTokens: number
}
interface HealthSummary {
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

// ============================================================
// 标签 / 格式化 helper
// ============================================================

const ACTION_LABELS: Record<string, string> = {
  AI_CHAT: 'AI 对话',
  AI_IDEA_GENERATE: '生成思路',
  AI_SCREENSHOT_ANALYZE: '截图分析',
  AI_ARTIFACT_ANALYZE: '产物分析',
  AI_REPORT_GENERATE: '生成报告',
}

function fmtMs(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  if (ms < 60_000) return (ms / 1000).toFixed(1) + 's'
  return (ms / 60_000).toFixed(1) + 'min'
}
function fmtPct(rate: number): string {
  return (rate * 100).toFixed(1) + '%'
}
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}
function rateTone(rate: number): 'success' | 'warn' | 'danger' {
  if (rate >= 0.95) return 'success'
  if (rate >= 0.85) return 'warn'
  return 'danger'
}

// ============================================================
// 组件
// ============================================================

type RangeKey = 'today' | '7d' | '30d'

export function AdminHealthTab() {
  const [range, setRange] = useState<RangeKey>('today')
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function load(opts: { refresh?: boolean } = {}) {
    if (opts.refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/health?range=' + range)
      if (!res.ok) {
        let msg = '健康监控数据加载失败'
        try { const d = await res.json(); if (d.error) msg = d.error } catch { /* ignore */ }
        throw new Error(msg)
      }
      const data = await res.json().catch(() => ({}))
      if (data.summary) setSummary(data.summary)
      else throw new Error('健康监控数据格式异常')
    } catch (e: any) {
      setError(e?.message || '健康监控数据加载失败，请检查网络后重试')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  if (loading && !summary) {
    return (
      <div className="panel p-16 text-center">
        <Loader2 className="h-6 w-6 text-gray-500 animate-spin inline" />
        <div className="mt-3 text-[12px] text-gray-500">加载健康监控数据…</div>
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="panel p-8 border-red-500/30 bg-red-500/5 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-sm text-red-300">{error}</p>
        <Button size="sm" variant="secondary" onClick={() => load()}>
          重试
        </Button>
      </div>
    )
  }

  if (!summary) return null
  const { totals, byAction, failures, latency, hourlyTrend, userRanking, window: win } = summary
  const maxHourTotal = Math.max(1, ...hourlyTrend.map(h => h.total))
  const maxLatencyCount = Math.max(1, ...latency.map(b => b.count))
  const maxFailureCount = Math.max(1, ...failures.map(f => f.count))

  return (
    <div className="space-y-6">
      {/* === 顶部：范围切换 + 刷新 === */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">时间范围</span>
          <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/10">
            {(['today', '7d', '30d'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 h-7 rounded-md text-[11px] font-medium transition-colors',
                  range === r ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300',
                )}
              >
                {r === 'today' ? '近 24 小时' : r === '7d' ? '近 7 天' : '近 30 天'}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-500 ml-2">
            窗口：{new Date(win.from).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {' → '}
            {new Date(win.to).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load({ refresh: true })} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </Button>
      </div>

      {/* === 4 个核心 score-tile（与 audit tab 不重复：成功率 / 平均耗时 / p95 / p99） === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={cn('score-tile', rateTone(totals.aiCallsSuccessRate) === 'success' ? 'green' : rateTone(totals.aiCallsSuccessRate) === 'warn' ? 'amber' : 'red')}>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">AI 成功率</span>
              <Gauge className="h-4 w-4 text-gray-400" />
            </div>
            <div className="display text-4xl tabular text-white leading-none">
              {totals.aiCallsTotal > 0 ? fmtPct(totals.aiCallsSuccessRate) : '—'}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              {totals.aiCallsTotal} 次调用 · 失败 {totals.aiCallsFailed} 次
            </div>
          </div>
        </div>
        <div className="score-tile indigo">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">平均耗时</span>
              <Clock className="h-4 w-4 text-indigo-400/70" />
            </div>
            <div className="display text-4xl tabular text-white leading-none">
              {totals.aiCallsTotal > 0 ? fmtMs(totals.avgDurationMs) : '—'}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">仅基于有 duration 字段的记录</div>
          </div>
        </div>
        <div className="score-tile amber">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">P95 耗时</span>
              <TrendingUp className="h-4 w-4 text-amber-400/70" />
            </div>
            <div className="display text-4xl tabular text-white leading-none">
              {totals.aiCallsTotal > 0 ? fmtMs(totals.p95DurationMs) : '—'}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">95% 调用快于此</div>
          </div>
        </div>
        <div className="score-tile violet">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">P99 耗时</span>
              <Zap className="h-4 w-4 text-violet-400/70" />
            </div>
            <div className="display text-4xl tabular text-white leading-none">
              {totals.aiCallsTotal > 0 ? fmtMs(totals.p99DurationMs) : '—'}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">长尾上限参考</div>
          </div>
        </div>
      </div>

      {/* === 24h / 7d / 30d 趋势条 === */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-indigo-300" />
          <h3 className="text-[14px] font-medium text-white">调用趋势（按小时）</h3>
          <Badge variant="muted" className="text-[10px]">{hourlyTrend.length} 个时段</Badge>
        </div>
        {totals.aiCallsTotal === 0 ? (
          <div className="text-center text-[12px] text-gray-500 py-8">
            当前时间范围内没有 AI 调用记录
          </div>
        ) : (
          <div className="flex items-end gap-[2px] h-32 overflow-x-auto">
            {hourlyTrend.map((h, i) => {
              const totalPct = (h.total / maxHourTotal) * 100
              const failedPct = h.total > 0 ? (h.failed / h.total) * 100 : 0
              return (
                <div
                  key={i}
                  className="relative flex-1 min-w-[6px] h-full flex flex-col justify-end group"
                  title={`${new Date(h.hourStart).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit' })} · 共 ${h.total} 次（失败 ${h.failed}）`}
                >
                  <div
                    className="bg-gradient-to-t from-indigo-500/70 to-violet-400/70 rounded-t-sm transition-all"
                    style={{ height: totalPct + '%' }}
                  >
                    {failedPct > 0 && (
                      <div
                        className="bg-red-500/80 rounded-t-sm"
                        style={{ height: failedPct + '%' }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gradient-to-b from-indigo-500/70 to-violet-400/70 inline-block" /> 成功
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500/80 inline-block" /> 失败
          </span>
          <span className="ml-auto">鼠标悬停看每小时详情</span>
        </div>
      </div>

      {/* === 按操作类型分组 === */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2 border-b border-white/[0.06]">
          <Activity className="h-4 w-4 text-indigo-400" />
          <h3 className="text-[14px] font-medium text-white">按操作类型</h3>
          <Badge variant="muted" className="text-[10px]">{byAction.length} 类</Badge>
        </div>
        {byAction.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-gray-500">无 AI_* 操作记录</div>
        ) : (
          <div>
            <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-white/[0.04]">
              <div className="col-span-3">操作</div>
              <div className="col-span-1 text-right">总数</div>
              <div className="col-span-2">成功率</div>
              <div className="col-span-2 text-right">平均耗时</div>
              <div className="col-span-2 text-right">P95 耗时</div>
              <div className="col-span-2 text-right">平均 Token</div>
            </div>
            {byAction.map(a => (
              <div key={a.action} className="px-5 py-3 grid grid-cols-12 gap-3 items-center border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                <div className="col-span-3">
                  <div className="text-[13px] text-white">{actionLabel(a.action)}</div>
                  <div className="text-[10px] text-gray-400 mono">{a.action}</div>
                </div>
                <div className="col-span-1 text-right tabular text-[14px] text-white">{a.total}</div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        rateTone(a.successRate) === 'success' && 'bg-emerald-400',
                        rateTone(a.successRate) === 'warn' && 'bg-amber-400',
                        rateTone(a.successRate) === 'danger' && 'bg-red-400',
                      )}
                      style={{ width: (a.successRate * 100) + '%' }}
                    />
                  </div>
                  <span className="text-[11px] tabular text-gray-300 w-10 text-right">
                    {fmtPct(a.successRate)}
                  </span>
                </div>
                <div className="col-span-2 text-right tabular text-[12px] text-gray-300">
                  {fmtMs(a.avgDurationMs)}
                </div>
                <div className="col-span-2 text-right tabular text-[12px] text-gray-300">
                  {fmtMs(a.p95DurationMs)}
                </div>
                <div className="col-span-2 text-right tabular text-[12px] text-gray-300">
                  {fmtNum(a.avgTokenIn)}<span className="text-gray-400"> / {fmtNum(a.avgTokenOut)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === 失败原因 + 延迟分布 双栏 === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 失败原因 */}
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h3 className="text-[14px] font-medium text-white">失败原因分类</h3>
            <Badge variant="muted" className="text-[10px]">{failures.length} 类 · {totals.aiCallsFailed} 次</Badge>
          </div>
          {failures.length === 0 ? (
            <div className="text-center text-[12px] text-emerald-400 py-8">
              ✓ 时间窗内无失败记录
            </div>
          ) : (
            <div className="space-y-2.5">
              {failures.map(f => (
                <div key={f.category}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-white">{f.label}</span>
                    <span className="text-[11px] tabular text-gray-400 mono">{f.count}</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full"
                      style={{ width: (f.count / maxFailureCount * 100) + '%' }}
                    />
                  </div>
                  {f.samples.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">
                        查看样本（{f.samples.length}）
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {f.samples.map((s, i) => (
                          <div key={i} className="text-[10px] text-red-300/80 bg-red-500/5 border border-red-500/15 rounded px-2 py-1 mono break-all">
                            {s}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 延迟分布 */}
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-indigo-300" />
            <h3 className="text-[14px] font-medium text-white">延迟分布</h3>
            <Badge variant="muted" className="text-[10px]">5 桶</Badge>
          </div>
          {totals.aiCallsTotal === 0 ? (
            <div className="text-center text-[12px] text-gray-500 py-8">无数据</div>
          ) : (
            <div className="space-y-2.5">
              {latency.map((b, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-white">{b.label}</span>
                    <span className="text-[11px] tabular text-gray-400 mono">{b.count}</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        i <= 1 ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' :
                        i === 2 ? 'bg-gradient-to-r from-indigo-500 to-violet-400' :
                        i === 3 ? 'bg-gradient-to-r from-amber-500 to-orange-400' :
                                  'bg-gradient-to-r from-red-500 to-rose-400',
                      )}
                      style={{ width: (b.count / maxLatencyCount * 100) + '%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === 用户 AI 调用排行 === */}
      <div className="panel p-0 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2 border-b border-white/[0.06]">
          <Users className="h-4 w-4 text-violet-400" />
          <h3 className="text-[14px] font-medium text-white">用户 AI 调用排行</h3>
          <Badge variant="muted" className="text-[10px]">Top {userRanking.length}</Badge>
        </div>
        {userRanking.length === 0 ? (
          <div className="p-8 text-center text-[12px] text-gray-500">无数据</div>
        ) : (
          <div>
            <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-white/[0.04]">
              <div className="col-span-4">用户</div>
              <div className="col-span-2 text-right">总调用</div>
              <div className="col-span-3">成功率</div>
              <div className="col-span-3 text-right">累计 Token</div>
            </div>
            {userRanking.map((u, i) => (
              <div key={u.userId} className="px-5 py-3 grid grid-cols-12 gap-3 items-center border-b border-white/[0.02] last:border-0 hover:bg-white/[0.02]">
                <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] mono text-gray-500 w-5 text-right tabular">#{i + 1}</span>
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                    {u.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] text-white truncate">{u.username}</div>
                    <div className="text-[10px] text-gray-400 mono truncate">{u.userId === 'anonymous' ? '匿名' : u.userId.slice(-8)}</div>
                  </div>
                </div>
                <div className="col-span-2 text-right tabular text-[14px] text-white">{u.total}</div>
                <div className="col-span-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        rateTone(u.successRate) === 'success' && 'bg-emerald-400',
                        rateTone(u.successRate) === 'warn' && 'bg-amber-400',
                        rateTone(u.successRate) === 'danger' && 'bg-red-400',
                      )}
                      style={{ width: (u.successRate * 100) + '%' }}
                    />
                  </div>
                  <span className="text-[11px] tabular text-gray-300 w-10 text-right">
                    {fmtPct(u.successRate)}
                  </span>
                </div>
                <div className="col-span-3 text-right tabular text-[12px] text-gray-300">
                  {fmtNum(u.totalTokens)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
