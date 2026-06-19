'use client'

import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkingStatusProps {
  phase: string
  hint?: string
  startedAt?: number
  onCancel?: () => void
  variant?: 'bar' | 'inline'
  dotColor?: 'indigo' | 'cyan' | 'emerald' | 'amber' | 'red' | 'fuchsia'
  className?: string
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s.toFixed(1)}s`
}

export function WorkingStatus({
  phase,
  hint,
  startedAt,
  onCancel,
  variant = 'bar',
  dotColor = 'indigo',
  className,
}: WorkingStatusProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = startedAt ? now - startedAt : 0

  const dotColors: Record<string, string> = {
    indigo: 'bg-indigo-400',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
    fuchsia: 'bg-fuchsia-400',
  }
  const dotCls = dotColors[dotColor] || dotColors.indigo
  const textColors: Record<string, string> = {
    indigo: 'text-indigo-200',
    cyan: 'text-cyan-200',
    emerald: 'text-emerald-200',
    amber: 'text-amber-200',
    red: 'text-red-200',
    fuchsia: 'text-fuchsia-200',
  }
  const textCls = textColors[dotColor] || textColors.indigo
  const shimmerColors: Record<string, string> = {
    indigo: 'bg-indigo-400/40',
    cyan: 'bg-cyan-400/40',
    emerald: 'bg-emerald-400/40',
    amber: 'bg-amber-400/40',
    red: 'bg-red-400/40',
    fuchsia: 'bg-fuchsia-400/40',
  }
  const shimmerCls = shimmerColors[dotColor] || shimmerColors.indigo

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2 text-xs text-gray-400', className)}>
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', dotCls)} />
          <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', dotCls)} />
        </span>
        <span>{phase}</span>
        {startedAt && <span className="mono text-gray-500">{formatElapsed(elapsed)}</span>}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'panel px-4 py-3 flex items-center gap-3 text-[13px] animate-rise',
        className,
      )}
    >
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', dotCls)} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', dotCls)} />
      </span>
      <span className={cn('font-medium flex-shrink-0', textCls)}>{phase}</span>
      {startedAt && (
        <span className="text-gray-500 text-[11px] mono flex-shrink-0">
          {formatElapsed(elapsed)}
        </span>
      )}
      {hint && (
        <span className="text-gray-500 text-[11px] truncate">{hint}</span>
      )}
      <div className="ml-auto h-1 flex-1 max-w-[200px] bg-white/[0.06] rounded-full overflow-hidden">
        <div className={cn('h-full shimmer w-full', shimmerCls)} />
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
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
