'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Activity, Award, Check, Copy,
  FileCheck2, ListChecks, Pencil,
  RefreshCw, Send, ShieldCheck, Sparkles, Star, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { WorkingStatus } from '@/components/working-status'
import { VerificationEvidencePanel } from '@/components/tasks/VerificationEvidencePanel'
import { cn } from '@/lib/utils'
import { isAuthenticVerificationEvidence, parseVerificationEvidence } from '@/lib/verification-evidence'

interface Props {
  task: any
  onRefresh: () => void
}

type ReportSection = {
  key: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  accent: 'indigo' | 'amber' | 'cyan' | 'violet' | 'emerald'
  score?: number
  scoreMode?: 'integer' | 'half'
  content: string
}

type ActiveJob = {
  modelId: string
  mode: 'generate' | 'adjust'
  phase: string
  startedAt: number
  abort: () => void
  streamText: string
}

type ModelSummary = {
  id: string
  code: string
  overall: number
  efficiency: number
  quality: number
  artifactCount: number
  hasReport: boolean
  jobActive: boolean
}

const PHASE_TEXT: Record<string, string> = {
  reusing_artifact_analysis: '正在复用已完成的产物预分析...',
  analyzing_images: '正在解读产物核验证据...',
  analyzing_files: '正在逐份分析产物文件...',
  analyzing_file: '正在分析当前产物文件...',
  synthesizing: '正在汇总全部产物分析...',
  generating_report: '正在撰写评估报告...',
  adjusting_report: '正在根据您的反馈调整报告...',
  saving: '正在保存报告...',
}

const PHASE_DOT: Record<string, 'indigo' | 'cyan' | 'emerald' | 'amber'> = {
  analyzing_images: 'cyan',
  analyzing_files: 'cyan',
  analyzing_file: 'cyan',
  synthesizing: 'indigo',
  generating_report: 'indigo',
  adjusting_report: 'indigo',
  saving: 'emerald',
}

const ACCENT_MAP: Record<string, { text: string; bg: string; ring: string }> = {
  indigo:  { text: 'text-indigo-300',  bg: 'bg-indigo-500/10',  ring: 'ring-indigo-500/30' },
  amber:   { text: 'text-amber-300',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/30' },
  cyan:    { text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    ring: 'ring-cyan-500/30' },
  violet:  { text: 'text-violet-300',  bg: 'bg-violet-500/10',  ring: 'ring-violet-500/30' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
}

function tierClass(score: number): 'green' | 'amber' | 'red' | 'muted' {
  if (!score) return 'muted'
  if (score >= 8) return 'green'
  if (score >= 6) return 'amber'
  return 'red'
}

function tierText(score: number): string {
  if (!score) return 'text-gray-500'
  if (score >= 8) return 'text-emerald-300'
  if (score >= 6) return 'text-amber-300'
  return 'text-red-300'
}

function formatScore(score: number | undefined, mode: 'integer' | 'half' = 'half'): string {
  const value = Number(score || 0)
  if (!value) return '-'
  if (mode === 'integer') return String(Math.min(10, Math.max(1, Math.round(value))))
  const normalized = Math.min(10, Math.max(1, Math.round(value * 2) / 2))
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
}

function buildSectionCopyText(section: ReportSection): string {
  if (section.score !== undefined) {
    return [section.title, '评分：' + formatScore(section.score, section.scoreMode) + '分', section.content].join('\n')
  }
  return [section.title, section.content].join('\n')
}

export default function StepReport({ task, onRefresh }: Props) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [activeJobs, setActiveJobs] = useState<Record<string, ActiveJob>>({})
  const [adjustText, setAdjustText] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [streamPreview, setStreamPreview] = useState<Record<string, string>>({})
  const abortRefs = useRef<Record<string, AbortController>>({})

  const models = task.models || []

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  useEffect(() => () => {
    Object.values(abortRefs.current).forEach(ctrl => ctrl.abort())
  }, [])

  const selectedModel = models.find((model: any) => model.id === selectedModelId)
  const latestReport = selectedModel?.reports?.[0]
  const activeJob = selectedModelId ? activeJobs[selectedModelId] : undefined
  const isGenerating = Boolean(activeJob && activeJob.mode === 'generate')
  const isAdjusting = Boolean(activeJob && activeJob.mode === 'adjust')
  const testerEvidenceCount = selectedModel
    ? parseVerificationEvidence(selectedModel.verificationScreenshotUrls).filter(isAuthenticVerificationEvidence).length
    : 0
  const hasTesterEvidence = testerEvidenceCount > 0

  const SECTION_DEFS: Array<Omit<ReportSection, 'score' | 'content'>> = [
    { key: 'product',     title: '产物效果反馈',     icon: Sparkles,    accent: 'cyan' },
    { key: 'efficiency',  title: '交付效率',         icon: Zap,         accent: 'amber', scoreMode: 'half' },
    { key: 'quality',     title: '产物质量',         icon: ShieldCheck, accent: 'violet', scoreMode: 'half' },
    { key: 'overall',     title: '综合评价',         icon: Award,       accent: 'emerald', scoreMode: 'integer' },
    { key: 'trajectory',  title: '轨迹分析',         icon: Activity,    accent: 'indigo' },
  ]

  const reportSections: ReportSection[] = latestReport ? [
    { ...SECTION_DEFS[0], content: latestReport.productFeedback || '' },
    { ...SECTION_DEFS[1], score: latestReport.efficiencyScore, content: latestReport.efficiencyComment || '' },
    { ...SECTION_DEFS[2], score: latestReport.qualityScore,    content: latestReport.qualityComment || '' },
    { ...SECTION_DEFS[3], score: latestReport.overallScore,    content: latestReport.overallComment || '' },
    { ...SECTION_DEFS[4], content: latestReport.trajectoryAnalysis || (selectedModel?.processText ? selectedModel.processText : '未提供轨迹截图。') },
  ] : []

  function showNote(type: 'ok' | 'err', text: string, timeout = type === 'err' ? 8000 : 3000) {
    setNote({ type, text })
    window.setTimeout(() => setNote(null), timeout)
  }

  function cancelJob(modelId: string) {
    const ctrl = abortRefs.current[modelId]
    if (ctrl) ctrl.abort()
  }

  async function runReportStream({
    modelId, mode, body,
  }: {
    modelId: string
    mode: 'generate' | 'adjust'
    body: Record<string, unknown>
  }) {
    cancelJob(modelId)
    const ctrl = new AbortController()
    abortRefs.current[modelId] = ctrl

    if (mode === 'generate') {
      setActiveJobs(prev => ({ ...prev, [modelId]: { modelId, mode, phase: 'analyzing_images', startedAt: Date.now(), abort: () => cancelJob(modelId), streamText: '' } }))
    } else {
      setActiveJobs(prev => ({ ...prev, [modelId]: { modelId, mode, phase: 'adjusting_report', startedAt: Date.now(), abort: () => cancelJob(modelId), streamText: '' } }))
    }

    try {
      const res = await fetch('/api/tasks/' + task.id + '/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        let errMsg = '生成评估报告失败'
        try { errMsg = JSON.parse(errText).error || errMsg } catch { errMsg = errText.slice(0, 200) || errMsg }
        showNote('err', errMsg)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const updateJob = (patch: Partial<ActiveJob>) => {
        setActiveJobs(prev => {
          const cur = prev[modelId]
          if (!cur) return prev
          return { ...prev, [modelId]: { ...cur, ...patch } }
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        let event = 'message'
        let dataLines: string[] = []
        for (const line of lines) {
          if (line.startsWith('event:')) {
            event = line.slice(6).trim()
            dataLines = []
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          } else if (line === '') {
            if (dataLines.length) {
              const dataStr = dataLines.join('\n')
              try {
                const data = JSON.parse(dataStr)
                if (event === 'phase') {
                  updateJob({ phase: data.name || '' })
                } else if (event === 'delta') {
                  setStreamPreview(prev => {
                    const next = { ...prev, [modelId]: (prev[modelId] || '') + (data.text || '') }
                    updateJob({ streamText: next[modelId] })
                    return next
                  })
                } else if (event === 'done') {
                  setStreamPreview(prev => { const copy = { ...prev }; delete copy[modelId]; return copy })
                  onRefresh()
                  showNote('ok', mode === 'adjust' ? '报告已调整' : '评估报告生成完成')
                } else if (event === 'error') {
                  showNote('err', data.message || '生成失败')
                }
              } catch { /* ignore parse errors */ }
              event = 'message'
              dataLines = []
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        showNote('err', err?.message || String(err))
      }
    } finally {
      setActiveJobs(prev => { const copy = { ...prev }; delete copy[modelId]; return copy })
      delete abortRefs.current[modelId]
    }
  }

  function generateReport(modelId: string) {
    if (!hasTesterEvidence) {
      showNote('err', '请先完成后台代验，或上传/捕获至少 1 张核验证据。')
      return
    }
    runReportStream({ modelId, mode: 'generate', body: { modelId } })
  }

  function adjustReport(modelId: string) {
    if (!adjustText.trim()) return
    runReportStream({ modelId, mode: 'adjust', body: { modelId, adjustInstruction: adjustText } })
  }

  async function copySection(section: ReportSection) {
    await navigator.clipboard.writeText(buildSectionCopyText(section))
    setCopiedKey(section.key)
    window.setTimeout(() => setCopiedKey(null), 1600)
  }

  const liveStreamText = selectedModelId ? (streamPreview[selectedModelId] || '') : ''

  // Build per-model score summary
  const modelSummaries: ModelSummary[] = models.map((model: any): ModelSummary => {
    const report = model.reports?.[0]
    return {
      id: model.id,
      code: model.modelCode,
      overall: report?.overallScore || 0,
      efficiency: report?.efficiencyScore || 0,
      quality: report?.qualityScore || 0,
      artifactCount: Array.isArray(model.artifacts) ? model.artifacts.length : 0,
      hasReport: Boolean(report),
      jobActive: Boolean(activeJobs[model.id]),
    }
  })

  const sel = modelSummaries.find((s: ModelSummary) => s.id === selectedModelId)

  return (
    <div className="space-y-5 animate-rise">
      {/* === HEADER ROW === */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center flex-shrink-0 relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400/20 to-transparent blur-md" />
            <FileCheck2 className="h-5 w-5 text-cyan-300 relative z-10" />
          </div>
          <div>
            <h2 className="display text-xl sm:text-2xl tracking-tight">评估报告</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
              基于产物核验证据与上传产物，输出产物效果反馈、交付效率、产物质量、综合评价与轨迹分析。
            </p>
          </div>
        </div>

        {/* Model tabs */}
        {models.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {modelSummaries.map((m: ModelSummary) => {
              const isActive = selectedModelId === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={cn('step-pill', isActive && 'active')}
                >
                  <span className="mono">{m.code}</span>
                  {m.hasReport && <Star className="h-3 w-3 fill-current text-amber-400" />}
                  {m.jobActive && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* === NOTE BANNER === */}
      {note && (
        <div className={cn(
          'flex items-start gap-2 px-4 py-2.5 rounded-xl border text-sm select-text break-words animate-rise',
          note.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300',
        )}>
          {note.type === 'ok' ? <Check className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}

      {/* === SCORE OVERVIEW ROW === */}
      {models.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
          {modelSummaries.map((m: ModelSummary) => {
            const tier = tierClass(m.overall)
            const isActive = selectedModelId === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModelId(m.id)}
                className={cn(
                  'score-tile text-left cursor-pointer group',
                  tier,
                  isActive && 'ring-1 ring-white/20',
                )}
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">综合</span>
                    <div className="flex items-center gap-1">
                      {m.hasReport && <Star className="h-3 w-3 fill-current text-amber-400/70" />}
                      {m.jobActive && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="mono text-[13px] text-gray-300 font-medium truncate">{m.code}</span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className={cn('display text-4xl tabular leading-none', tierText(m.overall))}>
                      {formatScore(m.overall, 'integer')}
                    </span>
                    {m.overall > 0 && <span className="text-[10px] text-gray-600 mono mb-1">/10</span>}
                  </div>
                  <div className="flex gap-3 mt-2.5 text-[11px] text-gray-500 mono">
                    <span>效率 <span className={tierText(m.efficiency)}>{formatScore(m.efficiency)}</span></span>
                    <span className="text-gray-700">·</span>
                    <span>质量 <span className={tierText(m.quality)}>{formatScore(m.quality)}</span></span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* === MAIN CONTENT AREA === */}
      {selectedModel ? (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="mono text-sm font-medium text-white bg-white/[0.06] px-2.5 py-1 rounded-lg border border-white/10">
                {selectedModel.modelCode}
              </span>
              {sel && sel.artifactCount > 0 && (
                <Badge variant="muted" className="gap-1">
                  <ListChecks className="h-3 w-3" />
                  {sel.artifactCount} 项产物
                </Badge>
              )}
            </div>
            {!isGenerating && !isAdjusting && (
              <Button
                variant={latestReport ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => generateReport(selectedModel.id)}
                disabled={!hasTesterEvidence}
                title={!hasTesterEvidence ? '请先完成后台代验或保存至少 1 张核验证据' : undefined}
              >
                {latestReport ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {latestReport ? '重新生成' : '生成评估报告'}
              </Button>
            )}
          </div>

          {/* Working status */}
          {activeJob && (
            <WorkingStatus
              phase={PHASE_TEXT[activeJob.phase] || activeJob.phase}
              hint={activeJob.phase === 'saving' ? '写入数据库...' : undefined}
              startedAt={activeJob.startedAt}
              onCancel={() => cancelJob(selectedModel.id)}
              dotColor={PHASE_DOT[activeJob.phase] || 'indigo'}
            />
          )}

          {/* Two-column dashboard body */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT COLUMN — model summary + screenshots */}
            <div className="space-y-4 lg:col-span-1">
              {/* Model summary panel */}
              <div className="panel p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center">
                    <Award className="h-3.5 w-3.5 text-indigo-300" />
                  </div>
                  <h4 className="text-[13px] font-medium text-white">模型概览</h4>
                </div>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-gray-500">模型编码</span>
                    <span className="mono text-gray-200">{selectedModel.modelCode}</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-gray-500">产物数量</span>
                    <span className="text-gray-200">{sel?.artifactCount ?? 0} 项</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-gray-500">报告状态</span>
                    <span className={cn(
                      'mono',
                      latestReport ? 'text-emerald-300' : isGenerating ? 'text-cyan-300' : 'text-gray-500',
                    )}>
                      {isGenerating ? '生成中...' : latestReport ? '已生成' : '未生成'}
                    </span>
                  </div>
                  {latestReport && (
                    <>
                      <div className="h-px bg-white/[0.06] my-1" />
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-gray-500">综合评分</span>
                        <span className={cn('tabular display text-lg', tierText(latestReport.overallScore))}>
                          {formatScore(latestReport.overallScore, 'integer')}
                          <span className="text-[10px] text-gray-600 font-normal ml-0.5">/10</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <VerificationEvidencePanel
                taskId={task.id}
                model={selectedModel}
                fallbackEvidenceRaw={latestReport?.verificationScreenshotUrls}
                onRefresh={onRefresh}
                onNotice={showNote}
              />
            </div>

            {/* RIGHT COLUMN — report modules */}
            <div className="space-y-3 lg:col-span-2">
              {/* Live streaming preview */}
              {(isGenerating || isAdjusting) && liveStreamText && (
                <div className="module-card relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-cyan-500/[0.03] to-indigo-500/[0.03]" />
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-cyan-300 animate-pulse" />
                      <span className="text-[12px] font-medium text-cyan-200">
                        {isAdjusting ? '正在调整报告...' : '实时生成中'}
                      </span>
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
                        streaming
                      </span>
                    </div>
                    <pre className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed font-mono max-h-72 overflow-y-auto scrollbar-thin pr-2">
                      {liveStreamText}
                      <span className="inline-block w-1.5 h-4 bg-cyan-400 animate-pulse align-middle ml-0.5" />
                    </pre>
                  </div>
                </div>
              )}

              {/* Report module cards */}
              {latestReport && !isGenerating && !isAdjusting ? (
                <div className="space-y-3">
                  {reportSections.map(section => {
                    const Icon = section.icon
                    const accent = ACCENT_MAP[section.accent]
                    return (
                      <div key={section.key} className="module-card group/card">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn(
                              'h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0',
                              accent.bg,
                              'border-white/10',
                            )}>
                              <Icon className={cn('h-4 w-4', accent.text)} />
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-[13px] font-medium text-white leading-tight">{section.title}</h5>
                              {section.score !== undefined && (
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className={cn('display text-xl tabular leading-none', tierText(section.score))}>
                                    {formatScore(section.score, section.scoreMode)}
                                  </span>
                                  <span className="text-[10px] text-gray-600 mono">/ 10</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => copySection(section)}
                            className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 flex-shrink-0"
                            title="复制内容"
                          >
                            {copiedKey === section.key
                              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                              : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <p className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed pl-[42px]">
                          {section.content || <span className="text-gray-600 italic">（暂无内容）</span>}
                        </p>
                      </div>
                    )
                  })}

                  {/* Adjust section */}
                  <div className="panel p-4 mt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center">
                        <Pencil className="h-3.5 w-3.5 text-indigo-300" />
                      </div>
                      <h4 className="text-[13px] font-medium text-white">调整报告</h4>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={adjustText}
                        onChange={event => setAdjustText(event.target.value)}
                        placeholder="例如：综合评分改为 8 分，产物质量部分补充工具可用性问题"
                        className="bg-white/[0.03] border-white/[0.08]"
                        onKeyDown={event => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            adjustReport(selectedModel.id)
                            setAdjustText('')
                          }
                        }}
                      />
                      <Button
                        onClick={() => { adjustReport(selectedModel.id); setAdjustText('') }}
                        loading={isAdjusting}
                        loadingText="提交中..."
                        disabled={!adjustText.trim()}
                        size="sm"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : !isGenerating && !isAdjusting ? (
                /* Empty state — no report yet */
                <div className="panel p-10 flex flex-col items-center justify-center text-center">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 blur-xl rounded-full" />
                    <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-indigo-500/15 border border-white/10 flex items-center justify-center">
                      <FileCheck2 className="h-7 w-7 text-cyan-300" />
                    </div>
                  </div>
                  <h4 className="text-[15px] font-medium text-white mb-1.5">
                    尚未生成 <span className="mono text-cyan-300">{selectedModel.modelCode}</span> 的评估报告
                  </h4>
                  <p className="text-[13px] text-gray-500 max-w-sm mb-5">
                    完成后台代验或保存核验证据后，生成包含五大模块的正式评估报告。
                  </p>
                  <Button onClick={() => generateReport(selectedModel.id)} size="sm" disabled={!hasTesterEvidence}>
                    <Sparkles className="h-3.5 w-3.5" />
                    开始生成评估报告
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="panel p-12 text-center">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-500">暂无待测模型，请先完成第 3 / 4 步</p>
        </div>
      )}
    </div>
  )
}
