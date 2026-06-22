'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  FileCheck2, Star, ShieldCheck, Zap, Award, Activity,
  Sparkles, AlertTriangle, ArrowLeft, Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function SharePage() {
  const params = useParams()
  const token = params.token as string

  const [task, setTask] = useState<any>(null)
  const [share, setShare] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/share/' + token)
        const text = await res.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch { data = { error: text.slice(0, 200) } }
        if (!res.ok) {
          setError(data.error || '加载失败，请稍后重试')
          return
        }
        setTask(data.task)
        setShare(data.share)
        if (data.task?.models?.length > 0) {
          setSelectedModelId(data.task.models[0].id)
        }
      } catch (e: any) {
        setError(e.message || '网络异常，请稍后重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  const selectedModel = task?.models?.find((m: any) => m.id === selectedModelId)
  const latestReport = selectedModel?.reports?.[0]

  function tierText(score: number): string {
    if (!score) return 'text-gray-500'
    if (score >= 8) return 'text-emerald-300'
    if (score >= 6) return 'text-amber-300'
    return 'text-red-300'
  }

  function formatScore(score: number, mode: 'integer' | 'half' = 'half'): string {
    const value = Number(score || 0)
    if (!value) return '-'
    if (mode === 'integer') return String(Math.min(10, Math.max(1, Math.round(value))))
    const normalized = Math.min(10, Math.max(1, Math.round(value * 2) / 2))
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
            <span className="text-sm text-gray-400">正在加载共享报告...</span>
          </div>
          <Skeleton className="h-10 w-64 rounded-lg mb-4" />
          <Skeleton className="h-5 w-96 rounded mb-10" />
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-200 flex items-center justify-center p-4">
        <div className="panel p-8 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-400" />
          <h2 className="text-xl font-medium mb-2">链接无效</h2>
          <p className="text-sm text-gray-400 mb-6">{error || '此共享链接不存在或已被吊销。'}</p>
          <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">
            登录 ModelEval Studio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      {/* Top bar */}
      <div className="border-b border-white/[0.06] bg-black/20 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-indigo-300" />
            </div>
            <span className="font-medium text-sm">ModelEval Studio</span>
          </Link>
          <Badge variant="outline" className="ml-auto text-[10px]">
            只读共享
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{task.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>创建者：{task.user?.username}</span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>模型数：{task.models?.length || 0}</span>
            {share?.expiresAt && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="text-amber-400">
                  有效期至 {new Date(share.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              </>
            )}
          </div>
        </div>

        {task.description && (
          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{task.description}</p>
        )}

        {/* Empty: no models at all */}
        {!task.models?.length ? (
          <div className="panel p-10 flex flex-col items-center justify-center text-center">
            <FileCheck2 className="h-10 w-10 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">该任务尚未添加任何模型</p>
            <p className="text-xs text-gray-600 mt-1">请等待任务创建者上传模型后再查看报告。</p>
          </div>
        ) : (
          <>
            {/* Score overview */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {task.models.map((m: any) => {
              const report = m.reports?.[0]
              const score = report?.overallScore || 0
              const isActive = selectedModelId === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={cn(
                    'score-tile text-left cursor-pointer',
                    score >= 8 ? 'green' : score >= 6 ? 'amber' : 'red',
                    isActive && 'ring-1 ring-white/20',
                  )}
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">综合</span>
                      {report && <Star className="h-3 w-3 fill-current text-amber-400/70" />}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="mono text-[13px] text-gray-300 font-medium truncate">{m.modelCode}</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className={cn('display text-4xl tabular leading-none', tierText(score))}>
                        {formatScore(score, 'half')}
                      </span>
                      {score > 0 && <span className="text-[10px] text-gray-600 mono mb-1">/10</span>}
                    </div>
                    <div className="flex gap-3 mt-2.5 text-[11px] text-gray-500 mono">
                      <span>效率 <span className={tierText(report?.efficiencyScore || 0)}>{formatScore(report?.efficiencyScore || 0)}</span></span>
                      <span className="text-gray-700">·</span>
                      <span>质量 <span className={tierText(report?.qualityScore || 0)}>{formatScore(report?.qualityScore || 0)}</span></span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Report detail */}
          {selectedModel && latestReport && (
            <div className="panel p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono text-sm font-medium text-white bg-white/[0.06] px-2.5 py-1 rounded-lg border border-white/10">
                  {selectedModel.modelCode}
                </span>
                <Badge variant="muted">{selectedModel.artifacts?.length || 0} 项产物</Badge>
              </div>

              <ReportModule
                icon={Sparkles}
                title="产物效果反馈"
                accent="cyan"
                content={latestReport.productFeedback}
              />
              <ReportModule
                icon={Zap}
                title="交付效率"
                accent="amber"
                score={latestReport.efficiencyScore}
                content={latestReport.efficiencyComment}
              />
              <ReportModule
                icon={ShieldCheck}
                title="产物质量"
                accent="violet"
                score={latestReport.qualityScore}
                content={latestReport.qualityComment}
              />
              <ReportModule
                icon={Award}
                title="综合评价"
                accent="emerald"
                score={latestReport.overallScore}
                scoreMode="integer"
                content={latestReport.overallComment}
              />
              <ReportModule
                icon={Activity}
                title="轨迹分析"
                accent="indigo"
                content={latestReport.trajectoryAnalysis || '未提供轨迹分析。'}
              />
            </div>
          )}

          {selectedModel && !latestReport && (
            <div className="panel p-10 flex flex-col items-center justify-center text-center">
              <FileCheck2 className="h-10 w-10 text-gray-600 mb-3" />
              <p className="text-sm text-gray-500">该模型暂无评估报告</p>
              <p className="text-xs text-gray-600 mt-1">报告生成后会自动显示在这里。</p>
            </div>
          )}
        </>
        )}

        {/* Footer */}
        <div className="text-center text-[11px] text-gray-600 pt-4">
          本报告由 ModelEval Studio 生成 · 仅供评估参考
        </div>
      </div>
    </div>
  )
}

function ReportModule({
  icon: Icon,
  title,
  accent,
  score,
  scoreMode = 'half',
  content,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  accent: 'cyan' | 'amber' | 'violet' | 'emerald' | 'indigo'
  score?: number
  scoreMode?: 'integer' | 'half'
  content: string
}) {
  const ACCENT_MAP: Record<string, { text: string; bg: string }> = {
    indigo:  { text: 'text-indigo-300',  bg: 'bg-indigo-500/10' },
    amber:   { text: 'text-amber-300',   bg: 'bg-amber-500/10' },
    cyan:    { text: 'text-cyan-300',    bg: 'bg-cyan-500/10' },
    violet:  { text: 'text-violet-300',  bg: 'bg-violet-500/10' },
    emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
  }

  function tierText(score: number): string {
    if (!score) return 'text-gray-500'
    if (score >= 8) return 'text-emerald-300'
    if (score >= 6) return 'text-amber-300'
    return 'text-red-300'
  }

  function formatScore(score: number, mode: 'integer' | 'half'): string {
    const value = Number(score || 0)
    if (!value) return '-'
    if (mode === 'integer') return String(Math.min(10, Math.max(1, Math.round(value))))
    const normalized = Math.min(10, Math.max(1, Math.round(value * 2) / 2))
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
  }

  const accentCls = ACCENT_MAP[accent]

  return (
    <div className="border-t border-white/[0.06] pt-4 first:border-0 first:pt-0">
      <div className="flex items-start gap-3 mb-2">
        <div className={cn(
          'h-8 w-8 rounded-lg border border-white/10 flex items-center justify-center flex-shrink-0',
          accentCls.bg,
        )}>
          <Icon className={cn('h-4 w-4', accentCls.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-medium text-white">{title}</h5>
            {score !== undefined && (
              <span className={cn('display text-lg tabular leading-none', tierText(score))}>
                {formatScore(score, scoreMode)}
                <span className="text-[10px] text-gray-600 font-normal ml-0.5">/ 10</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed pl-[44px]">
        {content || <span className="text-gray-600 italic">（暂无内容）</span>}
      </p>
    </div>
  )
}
