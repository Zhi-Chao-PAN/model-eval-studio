'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, Copy, FileCheck2, Image as ImageIcon,
  RefreshCw, Send, Sparkles, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { WorkingStatus } from '@/components/working-status'
import { cn } from '@/lib/utils'
import { renderModelVerificationScreenshots } from '@/lib/artifact-screenshot-client'

interface Props {
  task: any
  onRefresh: () => void
}

type VerificationImage = {
  name: string
  dataUrl: string
}

type ReportSection = {
  key: string
  title: string
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

const PHASE_TEXT: Record<string, string> = {
  client_rendering: '正在生成产物验证截图...',
  analyzing_images: '正在用视觉模型解读验证截图...',
  generating_report: '正在撰写评估报告...',
  adjusting_report: '正在根据您的反馈调整报告...',
  saving: '正在保存报告...',
}

const PHASE_DOT: Record<string, 'indigo' | 'cyan' | 'emerald' | 'amber'> = {
  client_rendering: 'cyan',
  analyzing_images: 'cyan',
  generating_report: 'indigo',
  adjusting_report: 'indigo',
  saving: 'emerald',
}

function parseVerificationImages(raw?: string | null): VerificationImage[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const images = Array.isArray(parsed) ? parsed : parsed?.images
    if (!Array.isArray(images)) return []
    return images.filter((image: any) => typeof image?.name === 'string' && typeof image?.dataUrl === 'string')
  } catch {
    return []
  }
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
  const [previewImages, setPreviewImages] = useState<Record<string, VerificationImage[]>>({})
  const [streamPreview, setStreamPreview] = useState<Record<string, string>>({})
  const abortRefs = useRef<Record<string, AbortController>>({})

  const models = task.models || []

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  useEffect(() => () => {
    // Cleanup: abort any in-flight requests on unmount
    Object.values(abortRefs.current).forEach(ctrl => ctrl.abort())
  }, [])

  const selectedModel = models.find((model: any) => model.id === selectedModelId)
  const latestReport = selectedModel?.reports?.[0]
  const activeJob = selectedModelId ? activeJobs[selectedModelId] : undefined
  const isGenerating = Boolean(activeJob && activeJob.mode === 'generate')
  const isAdjusting = Boolean(activeJob && activeJob.mode === 'adjust')

  const verificationImages = useMemo(() => {
    if (!selectedModel) return []
    // Show freshly generated preview screenshots while streaming, or saved ones
    if (isGenerating && previewImages[selectedModel.id]?.length) return previewImages[selectedModel.id]
    return parseVerificationImages(selectedModel?.verificationScreenshotUrls || latestReport?.verificationScreenshotUrls)
  }, [selectedModel, latestReport, isGenerating, previewImages])

  const reportSections: ReportSection[] = latestReport ? [
    { key: 'product', title: '产物效果反馈', content: latestReport.productFeedback || '' },
    { key: 'efficiency', title: '模型交付效率是否符合预期？', score: latestReport.efficiencyScore, scoreMode: 'half', content: latestReport.efficiencyComment || '' },
    { key: 'quality', title: '模型的产物质量怎么样', score: latestReport.qualityScore, scoreMode: 'half', content: latestReport.qualityComment || '' },
    { key: 'overall', title: '模型的综合表现怎么样', score: latestReport.overallScore, scoreMode: 'integer', content: latestReport.overallComment || '' },
    { key: 'trajectory', title: '轨迹分析', content: latestReport.trajectoryAnalysis || (selectedModel?.processText ? selectedModel.processText : '未提供轨迹截图。') },
  ] : []

  const scores = models.map((model: any) => {
    const report = model.reports?.[0]
    return {
      code: model.modelCode,
      overall: report?.overallScore || 0,
      efficiency: report?.efficiencyScore || 0,
      quality: report?.qualityScore || 0,
    }
  })

  function showNote(type: 'ok' | 'err', text: string, timeout = type === 'err' ? 8000 : 3000) {
    setNote({ type, text })
    window.setTimeout(() => setNote(null), timeout)
  }

  function cancelJob(modelId: string) {
    const ctrl = abortRefs.current[modelId]
    if (ctrl) ctrl.abort()
  }

  async function runReportStream({
    modelId,
    mode,
    body,
  }: {
    modelId: string
    mode: 'generate' | 'adjust'
    body: Record<string, unknown>
  }) {
    // Abort any existing job for this model
    cancelJob(modelId)
    const ctrl = new AbortController()
    abortRefs.current[modelId] = ctrl

    // Client-side screenshot rendering phase (generate only)
    if (mode === 'generate') {
      const targetModel = models.find((m: any) => m.id === modelId)
      setActiveJobs(prev => ({ ...prev, [modelId]: { modelId, mode, phase: 'client_rendering', startedAt: Date.now(), abort: () => cancelJob(modelId), streamText: '' } }))
      let previewImgs: VerificationImage[] = []
      try {
        previewImgs = renderModelVerificationScreenshots(targetModel?.modelCode || '', targetModel?.artifacts || [])
        setPreviewImages(prev => ({ ...prev, [modelId]: previewImgs }))
        body.verificationImages = previewImgs
      } catch (err) {
        console.warn('Client-side screenshot rendering failed:', err)
      }
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

        // Parse SSE events from buffer
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
                  setPreviewImages(prev => { const copy = { ...prev }; delete copy[modelId]; return copy })
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

  // Live preview text while streaming (for generating/adjusting)
  const liveStreamText = selectedModelId ? (streamPreview[selectedModelId] || '') : ''

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
            <FileCheck2 className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="display text-xl">评估报告</h2>
            <p className="text-sm text-gray-400 mt-1">
              按测试平台提交项生成：AI 自动核验产物并截图，再输出产物效果反馈、交付效率、产物质量、综合评价与轨迹分析。
            </p>
          </div>
        </div>
      </div>

      {note && (
        <div className={cn(
          'flex items-start gap-2 px-4 py-2.5 rounded-lg border text-sm select-text break-words animate-rise',
          note.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300',
        )}>
          {note.type === 'ok' ? <Check className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}

      {models.length > 0 && (
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-white text-[14px]">评分概览</h3>
            <Badge variant="muted" className="mono">{models.length} 个模型</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {scores.map((score: any) => (
              <div
                key={score.code}
                className={cn(
                  'rounded-lg p-3 text-center border transition-all',
                  score.overall >= 8 ? 'bg-emerald-500/10 border-emerald-500/20' :
                  score.overall >= 6 ? 'bg-amber-500/10 border-amber-500/20' :
                  score.overall > 0 ? 'bg-red-500/10 border-red-500/20' :
                  'bg-white/[0.02] border-white/[0.06]',
                )}
              >
                <div className="font-medium text-sm text-white mb-2 mono truncate">{score.code}</div>
                <div className="display text-3xl text-white tabular">{formatScore(score.overall, 'integer')}</div>
                <div className="text-[10px] text-gray-500 mt-1 uppercase">综合评价</div>
                <div className="flex justify-center gap-3 mt-2 text-[11px] text-gray-400 mono">
                  <span>效率 {formatScore(score.efficiency)}</span>
                  <span>/</span>
                  <span>质量 {formatScore(score.quality)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass overflow-hidden">
        {models.length > 0 && (
          <div className="flex gap-1 p-2 border-b border-white/[0.06] overflow-x-auto scrollbar-thin">
            {models.map((model: any) => {
              const isActive = selectedModelId === model.id
              const hasReport = model.reports?.length > 0
              const jobActive = Boolean(activeJobs[model.id])
              return (
                <button
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] mono whitespace-nowrap transition-colors',
                    isActive ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                  )}
                >
                  {model.modelCode}
                  {hasReport && <Star className="h-3 w-3 fill-current text-amber-400" />}
                  {jobActive && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />}
                </button>
              )
            })}
          </div>
        )}

        {selectedModel ? (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-medium text-white">
                {selectedModel.modelCode}
                <span className="text-gray-500 font-normal text-[13px] ml-1">评估报告</span>
              </h3>
              {!isGenerating && !isAdjusting && (
                <Button
                  variant={latestReport ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => generateReport(selectedModel.id)}
                  loading={false}
                >
                  {latestReport ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {latestReport ? '重新生成' : '生成评估报告'}
                </Button>
              )}
            </div>

            {/* Working status bar during generation */}
            {activeJob && (
              <WorkingStatus
                phase={PHASE_TEXT[activeJob.phase] || activeJob.phase}
                hint={activeJob.phase === 'saving' ? '写入数据库...' : undefined}
                startedAt={activeJob.startedAt}
                onCancel={() => cancelJob(selectedModel.id)}
                dotColor={PHASE_DOT[activeJob.phase] || 'indigo'}
              />
            )}

            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon className="h-4 w-4 text-cyan-300 flex-shrink-0" />
                  <h4 className="text-[13px] font-medium text-gray-200">产物验证截图</h4>
                  <Badge variant="muted" className="text-[10px] gap-1 bg-cyan-500/10 text-cyan-300 border-cyan-500/20">
                    <Sparkles className="h-2.5 w-2.5" /> AI 自动核验
                  </Badge>
                  {verificationImages.length > 0 && (
                    <span className="text-[11px] text-gray-500">{verificationImages.length} 张</span>
                  )}
                </div>
              </div>

              {verificationImages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {verificationImages.map((image, index) => (
                    <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group">
                      <img src={image.dataUrl} alt={image.name} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 text-[10px] text-gray-300 truncate">
                        {image.name}
                      </div>
                    </div>
                  ))}
                </div>
              ) : isGenerating ? (
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/[0.06] rounded-lg flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  正在自动生成验证截图...
                </div>
              ) : latestReport ? (
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/[0.06] rounded-lg">
                  暂无验证截图（可能因产物为非文本类型或截图生成失败）
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/[0.06] rounded-lg flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  点击"生成评估报告"，AI 将自动打开核验产物并生成验证截图
                </div>
              )}
            </div>

            {/* Streaming preview while generating */}
            {(isGenerating || isAdjusting) && liveStreamText && (
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  实时预览
                </div>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-mono max-h-64 overflow-y-auto">
                  {liveStreamText}
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse align-middle ml-0.5" />
                </pre>
              </div>
            )}

            {latestReport && !isGenerating && !isAdjusting ? (
              <>
                <div className="space-y-3">
                  {reportSections.map((section) => (
                    <div key={section.key} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h4 className="text-[13px] font-medium text-gray-200">{section.title}</h4>
                          {section.score !== undefined && (
                            <div className="mt-1 flex items-end gap-1">
                              <span className={cn(
                                'display text-2xl tabular',
                                Number(section.score) >= 8 ? 'text-emerald-300' :
                                Number(section.score) >= 6 ? 'text-amber-300' :
                                'text-red-300',
                              )}>
                                {formatScore(section.score, section.scoreMode)}
                              </span>
                              <span className="text-xs text-gray-500 mono mb-1">/ 10</span>
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => copySection(section)}>
                          {copiedKey === section.key ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedKey === section.key ? '已复制' : '复制'}
                        </Button>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {section.content || <span className="text-gray-600">（暂无）</span>}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-white/[0.06]">
                  <p className="text-sm text-gray-400 mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                    调整报告
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={adjustText}
                      onChange={event => setAdjustText(event.target.value)}
                      placeholder="例如：综合评分改为 8 分，产物质量部分补充工具可用性问题"
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
                    >
                      <Send className="h-3.5 w-3.5" /> 提交
                    </Button>
                  </div>
                </div>
              </>
            ) : !isGenerating && !isAdjusting ? (
              <div className="py-10 text-center">
                <div className="inline-flex h-12 w-12 rounded-xl bg-white/[0.04] border border-white/10 items-center justify-center mb-3">
                  <FileCheck2 className="h-6 w-6 text-cyan-300" />
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  还没有为 <span className="mono text-white">{selectedModel.modelCode}</span> 生成评估报告
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-12 text-center text-sm text-gray-500">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-gray-600" />
            暂无待测模型，请先完成第 3 / 4 步
          </div>
        )}
      </div>
    </div>
  )
}
