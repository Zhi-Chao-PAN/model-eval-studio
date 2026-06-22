'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Loader2,
  ListTree,
} from 'lucide-react'

type AnalysisEvent = {
  id: string
  sequence: number
  phase: string
  status: string
  label: string
  detail?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

type AnalysisRun = {
  id: string
  status: string
  currentPhase?: string | null
  error?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  events?: AnalysisEvent[]
}

interface ArtifactAnalysisTraceProps {
  run?: AnalysisRun | null
  modelCode: string
}

function isActive(status: string): boolean {
  return status === 'QUEUED' || status === 'RUNNING'
}

function formatElapsed(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '等待启动'
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes} 分 ${String(seconds % 60).padStart(2, '0')} 秒` : `${seconds} 秒`
}

function formatEventTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function EventIcon({ status }: { status: string }) {
  if (status === 'FAILED' || status === 'WARNING') {
    return <CircleAlert className={status === 'FAILED' ? 'h-4 w-4 text-red-400' : 'h-4 w-4 text-amber-300'} />
  }
  if (status === 'STARTED' || status === 'QUEUED') {
    return <Loader2 className="h-4 w-4 text-indigo-300 animate-spin" />
  }
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
}

export function ArtifactAnalysisTrace({ run, modelCode }: ArtifactAnalysisTraceProps) {
  const active = Boolean(run && isActive(run.status))
  const [, setTick] = useState(0)
  const events = useMemo(() => run?.events || [], [run?.events])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setTick(value => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [active])

  if (!run) return null

  const statusText = run.status === 'COMPLETED'
    ? '预分析完成'
    : run.status === 'FAILED'
      ? '分析未完成'
      : run.status === 'QUEUED'
        ? '等待后台启动'
        : '后台分析中'

  return (
    <section className="mt-4 border-t border-white/[0.08] pt-4" aria-label={`${modelCode} 的产物分析轨迹`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-indigo-300" />
          <div>
            <h3 className="text-sm font-medium text-white">后台分析轨迹</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">展示已执行的操作与分析依据，不展示模型原始思维链。</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Clock3 className="h-3.5 w-3.5" />
          <span>{statusText}</span>
          <span className="text-gray-400">·</span>
          <span>已用时 {formatElapsed(run.startedAt, run.completedAt)}</span>
        </div>
      </div>

      <ol className="mt-4 space-y-0" aria-live="polite">
        {events.map((event, index) => (
          <li key={event.id} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
            {index < events.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-white/[0.08]" />}
            <span className="relative z-10 mt-0.5 rounded-full bg-[#15151c]">
              <EventIcon status={event.status} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-gray-200">{event.label}</span>
                <time className="mono shrink-0 text-[10px] text-gray-400" dateTime={event.createdAt}>
                  {formatEventTime(event.createdAt)}
                </time>
              </div>
              {(event.detail || event.metadata) && (
                <details className="group mt-1.5 text-[12px]">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-gray-500 hover:text-gray-300">
                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    查看分析依据
                  </summary>
                  <div className="mt-2 border-l border-indigo-400/30 pl-3 text-gray-400 leading-5 whitespace-pre-wrap break-words">
                    {event.detail}
                    {event.metadata && (
                      <Metadata metadata={event.metadata} />
                    )}
                  </div>
                </details>
              )}
            </div>
          </li>
        ))}
      </ol>

      {run.status === 'FAILED' && run.error && (
        <div className="mt-3 flex items-start gap-2 border-l-2 border-red-400/70 pl-3 text-xs text-red-300 break-words">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{run.error}</span>
        </div>
      )}
    </section>
  )
}

function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const items = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== '')
  if (items.length === 0) return null

  const labels: Record<string, string> = {
    artifactCount: '产物数量',
    artifactNames: '识别到的文件',
    primaryArtifactName: '主产物',
    renderMode: '渲染方式',
    runner: '执行环境',
    evidenceCount: '产物效果截图数',
    evidenceNames: '截图文件',
    fileName: '文件',
    charactersRead: '已读取字符',
    truncated: '内容截取',
  }

  return (
    <dl className="mt-2 grid gap-1 text-[11px] text-gray-500">
      {items.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-x-1.5">
          <dt>{labels[key] || key}：</dt>
          <dd className="text-gray-400 break-all">
            {Array.isArray(value) ? value.join('、') : value === true ? '是' : value === false ? '否' : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
