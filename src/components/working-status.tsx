'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Square } from 'lucide-react'

export interface TaskWorkingStatus {
  taskId: string
  step: string
  status: 'queued' | 'running'
  startedAt: string
  etaMs?: number
  progress?: string
}

interface WorkingStatusProps {
  /** Local phase label (e.g. "正在分析截图...") - if provided, shows local status instead of global SSE status */
  phase?: string
  /** Optional hint text shown next to the phase */
  hint?: string
  /** When the operation started (ms epoch) for elapsed time */
  startedAt?: number
  /** Tailwind color name for the dot/spinner */
  dotColor?: 'indigo' | 'amber' | 'cyan' | 'emerald' | 'fuchsia'
  /** Cancel callback; shows a stop button */
  onCancel?: () => void
}

const DOT_COLORS: Record<string, string> = {
  indigo: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
  amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  cyan: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  fuchsia: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
}

function formatElapsed(startedAt?: number): string {
  if (!startedAt) return ''
  const sec = Math.floor((Date.now() - startedAt) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s`
  return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}

export function WorkingStatus({ phase, hint, startedAt, dotColor = 'indigo', onCancel }: WorkingStatusProps) {
  const [working, setWorking] = useState<TaskWorkingStatus[]>([])
  const evtRef = useRef<EventSource | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, setTick] = useState(0)

  // SSE for global background tasks (only connects when no local phase is provided)
  useEffect(() => {
    // If a local phase is provided, we don't need global SSE
    if (phase) return
    let mounted = true

    function connect() {
      if (!mounted) return
      if (evtRef.current) {
        evtRef.current.close()
        evtRef.current = null
      }
      const evt = new EventSource('/api/tasks/working/stream')
      evtRef.current = evt

      evt.onmessage = (e) => {
        if (!mounted) return
        reconnectDelayRef.current = 1000
        try {
          const data = JSON.parse(e.data) as TaskWorkingStatus[]
          setWorking(Array.isArray(data) ? data : [])
        } catch {
          // ignore malformed SSE payload
        }
      }

      const handleDisconnect = () => {
        if (!mounted) return
        evt.close()
        evtRef.current = null
        const delay = reconnectDelayRef.current
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
          connect()
        }, delay)
      }

      evt.onerror = () => {
        handleDisconnect()
      }
    }

    connect()

    function onVisibility() {
      if (document.visibilityState === 'visible' && (!evtRef.current || evtRef.current.readyState === EventSource.CLOSED)) {
        reconnectDelayRef.current = 1000
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Tick every second for elapsed time display on background tasks
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(tickInterval)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (evtRef.current) evtRef.current.close()
      evtRef.current = null
    }
  }, [phase])

  // If local phase is provided, show local status (no SSE needed)
  if (phase) {
    return (
      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs border ${DOT_COLORS[dotColor] || DOT_COLORS.indigo}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="truncate max-w-[240px]">{phase}</span>
        {hint && <span className="text-white/50 flex-shrink-0">{hint}</span>}
        {startedAt && <span className="text-white/40 flex-shrink-0">{formatElapsed(startedAt)}</span>}
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="停止"
            className="flex-shrink-0 inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors border border-red-500/20"
            title="停止生成"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            停止
          </button>
        )}
      </div>
    )
  }

  // Global SSE mode - show background tasks
  if (working.length === 0) return null

  return (
    <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1.5 text-xs text-indigo-200">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="truncate max-w-[200px]">
        {working.length > 1
          ? `${working.length} 个任务执行中`
          : (working[0].progress || '任务执行中...')}
      </span>
      {onCancel && (
        <button
          onClick={onCancel}
          aria-label="停止生成"
          className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2.5 text-[11px] rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors border border-red-500/20"
          title="停止生成"
        >
          <Square className="h-3 w-3 fill-current" />
          停止
        </button>
      )}
    </div>
  )
}
