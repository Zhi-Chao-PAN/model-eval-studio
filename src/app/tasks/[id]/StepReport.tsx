'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Check, Copy, FileCheck2, Image as ImageIcon,
  RefreshCw, Send, Sparkles, Star, UploadCloud, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
    return [
      section.title,
      '评分：' + formatScore(section.score, section.scoreMode) + '分',
      section.content,
    ].join('\n')
  }
  return [section.title, section.content].join('\n')
}

function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const maxSide = 1600
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
        const width = Math.max(1, Math.round(image.naturalWidth * scale))
        const height = Math.max(1, Math.round(image.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('无法处理图片'))
          return
        }
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.onerror = () => reject(new Error('图片读取失败'))
      image.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

export default function StepReport({ task, onRefresh }: Props) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [adjustText, setAdjustText] = useState('')
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({})
  const [uploadingVerification, setUploadingVerification] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const models = task.models || []

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  const selectedModel = models.find((model: any) => model.id === selectedModelId)
  const latestReport = selectedModel?.reports?.[0]
  const verificationImages = useMemo(
    () => parseVerificationImages(selectedModel?.verificationScreenshotUrls || latestReport?.verificationScreenshotUrls),
    [latestReport?.verificationScreenshotUrls, selectedModel?.verificationScreenshotUrls],
  )

  const reportSections: ReportSection[] = latestReport ? [
    {
      key: 'product',
      title: '产物效果反馈',
      content: latestReport.productFeedback || '',
    },
    {
      key: 'efficiency',
      title: '模型交付效率是否符合预期？',
      score: latestReport.efficiencyScore,
      scoreMode: 'half',
      content: latestReport.efficiencyComment || '',
    },
    {
      key: 'quality',
      title: '模型的产物质量怎么样',
      score: latestReport.qualityScore,
      scoreMode: 'half',
      content: latestReport.qualityComment || '',
    },
    {
      key: 'overall',
      title: '模型的综合表现怎么样',
      score: latestReport.overallScore,
      scoreMode: 'integer',
      content: latestReport.overallComment || '',
    },
    {
      key: 'trajectory',
      title: '轨迹分析',
      content: latestReport.trajectoryAnalysis || (selectedModel?.processText ? selectedModel.processText : '未提供轨迹截图。'),
    },
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

  async function readJsonResponse(res: Response) {
    const text = await res.text().catch(() => '')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { error: text.slice(0, 300) || '服务器返回了非预期内容' }
    }
  }

  function showNote(type: 'ok' | 'err', text: string) {
    setNote({ type, text })
    window.setTimeout(() => setNote(null), type === 'err' ? 8000 : 3000)
  }

  async function saveVerificationImages(modelId: string, images: VerificationImage[]) {
    const res = await fetch('/api/tasks/' + task.id + '/models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        verificationScreenshotUrls: JSON.stringify({ images }),
      }),
    })
    const data = await readJsonResponse(res)
    if (!res.ok) throw new Error(data.error || '产物验证截图保存失败')
    onRefresh()
  }

  async function uploadVerificationScreenshots(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedModel) return
    const input = e.currentTarget
    const files = Array.from(input.files || [])
    if (files.length === 0) return

    setUploadingVerification(true)
    try {
      const nextImages = await Promise.all(files.map(async (file) => ({
        name: file.name,
        dataUrl: await fileToResizedDataUrl(file),
      })))
      await saveVerificationImages(selectedModel.id, [...verificationImages, ...nextImages].slice(0, 4))
      showNote('ok', '产物验证截图已保存')
    } catch (error: any) {
      showNote('err', error?.message || String(error))
    } finally {
      input.value = ''
      setUploadingVerification(false)
    }
  }

  async function removeVerificationImage(index: number) {
    if (!selectedModel) return
    try {
      await saveVerificationImages(selectedModel.id, verificationImages.filter((_, imageIndex) => imageIndex !== index))
      showNote('ok', '产物验证截图已删除')
    } catch (error: any) {
      showNote('err', error?.message || String(error))
    }
  }

  async function generateReport(modelId: string) {
    setGenerating(prev => ({ ...prev, [modelId]: true }))
    try {
      const res = await fetch('/api/tasks/' + task.id + '/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', data.error || '生成评估报告失败')
        return
      }
      if (data.report) onRefresh()
    } finally {
      setGenerating(prev => ({ ...prev, [modelId]: false }))
    }
  }

  async function adjustReport(modelId: string) {
    if (!adjustText.trim()) return
    setAdjusting(prev => ({ ...prev, [modelId]: true }))
    try {
      const res = await fetch('/api/tasks/' + task.id + '/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, adjustInstruction: adjustText }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', data.error || '调整评估报告失败')
        return
      }
      if (data.report) {
        setAdjustText('')
        onRefresh()
      }
    } finally {
      setAdjusting(prev => ({ ...prev, [modelId]: false }))
    }
  }

  async function copySection(section: ReportSection) {
    await navigator.clipboard.writeText(buildSectionCopyText(section))
    setCopiedKey(section.key)
    window.setTimeout(() => setCopiedKey(null), 1600)
  }

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
              按测试平台提交项生成：产物效果反馈、交付效率、产物质量、综合评价与轨迹分析。
            </p>
          </div>
        </div>
      </div>

      {note && (
        <div className={cn(
          'flex items-start gap-2 px-4 py-2.5 rounded-lg border text-sm select-text break-words',
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
              return (
                <button
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] mono whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                  )}
                >
                  {model.modelCode}
                  {hasReport && <Star className="h-3 w-3 fill-current text-amber-400" />}
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
              <Button
                variant={latestReport ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => generateReport(selectedModel.id)}
                loading={generating[selectedModel.id]}
              >
                {latestReport ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {latestReport ? '重新生成' : '生成评估报告'}
              </Button>
            </div>

            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon className="h-4 w-4 text-cyan-300 flex-shrink-0" />
                  <h4 className="text-[13px] font-medium text-gray-200">产物验证截图</h4>
                  <span className="text-[11px] text-gray-500">{verificationImages.length}/4</span>
                </div>
                <label className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                  uploadingVerification ? 'opacity-50 pointer-events-none' : 'text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10',
                )}>
                  <UploadCloud className="h-3.5 w-3.5" />
                  {uploadingVerification ? '上传中...' : '上传截图'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={uploadVerificationScreenshots}
                    disabled={uploadingVerification}
                  />
                </label>
              </div>

              {verificationImages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {verificationImages.map((image, index) => (
                    <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group">
                      <img src={image.dataUrl} alt={image.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeVerificationImage(index)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                        title="删除截图"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/[0.06] rounded-lg">
                  尚未上传产物验证截图
                </div>
              )}
            </div>

            {latestReport ? (
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
                        }
                      }}
                    />
                    <Button
                      onClick={() => adjustReport(selectedModel.id)}
                      loading={adjusting[selectedModel.id]}
                      disabled={!adjustText.trim()}
                    >
                      <Send className="h-3.5 w-3.5" /> 提交
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-10 text-center">
                <div className="inline-flex h-12 w-12 rounded-xl bg-white/[0.04] border border-white/10 items-center justify-center mb-3">
                  <FileCheck2 className="h-6 w-6 text-cyan-300" />
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  还没有为 <span className="mono text-white">{selectedModel.modelCode}</span> 生成评估报告
                </p>
                <Button onClick={() => generateReport(selectedModel.id)} loading={generating[selectedModel.id]}>
                  <Sparkles className="h-3.5 w-3.5" /> 生成评估报告
                </Button>
              </div>
            )}
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
