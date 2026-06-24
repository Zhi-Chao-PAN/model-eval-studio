'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, X, RefreshCw, Loader2, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assessHealthAlertLevel, type HealthAlert } from '@/lib/health-alert'

/**
 * 健康预警 banner。
 *
 * 行为契约：
 * - 每 60s 轮询一次 `/api/admin/health?window=1h`
 * - 失败静默：网络/API 错误不展示任何内容（不刷错）
 * - 用户可手动 dismiss（X 按钮），dismiss 后到下次刷新前不再出现
 * - 与 level 匹配的视觉：
 *   - critical：红色实色背景
 *   - warn：琥珀色
 *   - info：深灰
 *
 * 设计取舍：
 * - 不在 mount 时立刻轮询（避免冷启动负载），先 5s 后第一次，再每 60s
 * - 内部维护一个 timer ref，避免双计时
 */
interface Props {
  /** 自定义轮询间隔（ms）。默认 60000。 */
  pollIntervalMs?: number
  /** 自定义首次延迟（ms）。默认 5000。 */
  initialDelayMs?: number
}

export function HealthAlertBanner({ pollIntervalMs = 60_000, initialDelayMs = 5_000 }: Props) {
  const [alert, setAlert] = useState<HealthAlert | null>(null)
  const [dismissed, setDismissed] = useState<HealthAlertLevel | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let interval: ReturnType<typeof setInterval> | null = null

    async function fetchOnce() {
      if (cancelled) return
      try {
        setLoading(true)
        const res = await fetch('/api/admin/health?window=1h', { cache: 'no-store' })
        if (!res.ok) {
          // 失败静默：清空 alert（不显示过期数据）
          if (!cancelled) { setAlert(null); setLastChecked(new Date()) }
          return
        }
        const data = await res.json().catch(() => null)
        const summary = data?.summary ?? null
        if (cancelled) return
        setAlert(assessHealthAlertLevel(summary))
        setLastChecked(new Date())
        // 任何一次轮询成功后重置 dismiss——因为新轮询的结果可能更严重
        setDismissed(null)
      } catch {
        if (!cancelled) { setAlert(null); setLastChecked(new Date()) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    timer = setTimeout(() => {
      fetchOnce()
      interval = setInterval(fetchOnce, pollIntervalMs)
    }, initialDelayMs)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (interval) clearInterval(interval)
    }
  }, [pollIntervalMs, initialDelayMs])

  // 当前 alert 被用户 dismiss 过则不显示
  if (!alert || dismissed === alert.level) return null

  const style = LEVEL_STYLES[alert.level]
  const Icon = style.icon

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] animate-rise',
        style.container,
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', style.iconColor)} />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className={cn('px-1.5 h-5 rounded text-[10px] font-semibold tracking-wider uppercase inline-flex items-center', style.badge)}>
          {style.label}
        </span>
        <span className="text-white">{alert.message}</span>
        {lastChecked && (
          <span className="text-[10px] text-gray-400 mono">
            · {lastChecked.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 检测
          </span>
        )}
      </div>
      <a
        href="/admin"
        className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2 flex items-center gap-1"
      >
        <Gauge className="h-3 w-3" /> 查看
      </a>
      {loading && <Loader2 className="h-3.5 w-3.5 text-gray-500 animate-spin" />}
      {!loading && (
        <button
          type="button"
          onClick={() => setDismissed(alert.level)}
          aria-label="关闭预警"
          className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ============================================================
// 视觉配置
// ============================================================

type HealthAlertLevel = 'info' | 'warn' | 'critical'

const LEVEL_STYLES: Record<HealthAlertLevel, {
  label: string
  icon: typeof AlertTriangle
  container: string
  iconColor: string
  badge: string
}> = {
  critical: {
    label: '严重',
    icon: AlertTriangle,
    container: 'bg-red-500/15 border-red-500/30 backdrop-blur-sm',
    iconColor: 'text-red-300',
    badge: 'bg-red-500/30 text-red-100',
  },
  warn: {
    label: '警告',
    icon: AlertCircle,
    container: 'bg-amber-500/15 border-amber-500/30 backdrop-blur-sm',
    iconColor: 'text-amber-300',
    badge: 'bg-amber-500/30 text-amber-100',
  },
  info: {
    label: '提示',
    icon: Info,
    container: 'bg-white/[0.04] border-white/10 backdrop-blur-sm',
    iconColor: 'text-indigo-300',
    badge: 'bg-white/[0.08] text-gray-300',
  },
}
