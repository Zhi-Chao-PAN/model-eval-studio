'use client'
import { useState, useEffect } from 'react'
import {
  FileCheck2, Copy, RefreshCw, Send, Star, Check,
  Sparkles, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  task: any
  onAddMessage: (msg: any) => void
  onRefresh: () => void
}

function formatReportText(modelCode: string, report: any): string {
  return [
    '====================================',
    '评估对象：' + modelCode,
    '====================================',
    '',
    '【产物效果反馈】',
    (report.productFeedback || ''),
    '',
    '',
    '【模型的综合表现】',
    '评分：' + (report.overallScore || 0) + ' / 10',
    '评论：' + (report.overallComment || ''),
    '',
    '',
    '【模型交付效率是否符合预期】',
    '评分：' + (report.efficiencyScore || 0) + ' / 10',
    '评论：' + (report.efficiencyComment || ''),
    '',
    '',
    '【模型的产物质量】',
    '评分：' + (report.qualityScore || 0) + ' / 10',
    '评论：' + (report.qualityComment || ''),
    '',
  ].join('\n')
}

export default function StepReport({ task, onAddMessage, onRefresh }: Props) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [adjustText, setAdjustText] = useState('')
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState(false)

  const models = task.models || []

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  const selectedModel = models.find((m: any) => m.id === selectedModelId)
  const latestReport = selectedModel?.reports?.[0]

  async function generateReport(modelId: string) {
    setGenerating(prev => ({ ...prev, [modelId]: true }))
    try {
      const res = await fetch('/api/tasks/' + task.id + '/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      })
      let data; try { data = await res.json() } catch { throw new Error('服务器返回了非预期内容（HTTP ' + res.status + '），请稍后重试') }
      if (data.report) {
        onRefresh()
        onAddMessage({
          id: 'a-' + Date.now(), role: 'assistant',
          content: '已为 ' + (selectedModel?.modelCode || '') + ' 生成评估报告',
          step: 'REPORT', modelId,
        })
      }
    } finally { setGenerating(prev => ({ ...prev, [modelId]: false })) }
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
      let data2; try { data2 = await res.json() } catch { throw new Error('服务器返回了非预期内容（HTTP ' + res.status + '），请稍后重试') }
      if (data2.report) {
        onRefresh()
        onAddMessage({ id: 'u-' + Date.now(), role: 'user', content: adjustText, step: 'REPORT', modelId })
        onAddMessage({ id: 'a-' + Date.now(), role: 'assistant', content: '已根据你的反馈重新生成报告', step: 'REPORT', modelId })
        setAdjustText('')
      }
    } finally { setAdjusting(prev => ({ ...prev, [modelId]: false })) }
  }

  function copyReport() {
    if (!latestReport || !selectedModel) return
    navigator.clipboard.writeText(formatReportText(selectedModel.modelCode, latestReport))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scores = models.map((m: any) => {
    const r = m.reports?.[0]
    return {
      code: m.modelCode,
      overall: r?.overallScore || 0,
      efficiency: r?.efficiencyScore || 0,
      quality: r?.qualityScore || 0,
    }
  })

  const reportSections: Array<{ key: string; title: string; score?: number; content: string }> = latestReport ? [
    { key: 'product', title: '产物效果反馈', content: latestReport.productFeedback || '' },
    { key: 'overall', title: '模型的综合表现', score: latestReport.overallScore, content: latestReport.overallComment || '' },
    { key: 'efficiency', title: '模型交付效率是否符合预期', score: latestReport.efficiencyScore, content: latestReport.efficiencyComment || '' },
    { key: 'quality', title: '模型的产物质量', score: latestReport.qualityScore, content: latestReport.qualityComment || '' },
  ] : []
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
              AI 综合任务上下文 + 看板硬指标 + 产物分析，为每个模型生成结构化评估，可一键复制粘贴。
            </p>
          </div>
        </div>
      </div>

      {/* 综合评分对比 */}
      {models.length > 0 && (
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-white text-[14px]">综合评分对比</h3>
            <Badge variant="muted" className="mono">{models.length} 个模型</Badge>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(' + Math.min(models.length, 4) + ', 1fr)' }}>
            {scores.map((s: any, i: number) => (
              <div
                key={s.code}
                className={cn(
                  'rounded-lg p-3 text-center border transition-all',
                  s.overall >= 8 ? 'bg-emerald-500/10 border-emerald-500/20' :
                  s.overall >= 6 ? 'bg-amber-500/10 border-amber-500/20' :
                  s.overall > 0 ? 'bg-red-500/10 border-red-500/20' :
                  'bg-white/[0.02] border-white/[0.06]'
                )}
              >
                <div className="font-medium text-sm text-white mb-2 mono truncate">{s.code}</div>
                <div className="display text-3xl text-white tabular">{s.overall || '-'}</div>
                <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">综合表现</div>
                <div className="flex justify-center gap-3 mt-2 text-[11px] text-gray-400 mono">
                  <span>效率 {s.efficiency || '-'}</span>
                  <span>·</span>
                  <span>质量 {s.quality || '-'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 评估报告主体 */}
      <div className="glass overflow-hidden">
        {models.length > 0 && (
          <div className="flex gap-1 p-2 border-b border-white/[0.06] overflow-x-auto scrollbar-thin">
            {models.map((m: any) => {
              const isActive = selectedModelId === m.id
              const hasReport = m.reports?.length > 0
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] mono whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-white/[0.08] text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                  )}
                >
                  {m.modelCode}
                  {hasReport && <Star className="h-3 w-3 fill-current text-amber-400" />}
                </button>
              )
            })}
          </div>
        )}

        {selectedModel && latestReport ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-medium text-white">
                {selectedModel.modelCode} <span className="text-gray-500 font-normal text-[13px] ml-1">评估报告</span>
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={copyReport}>
                  {copied
                    ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> 已复制</>
                    : <><Copy className="h-3.5 w-3.5" /> 复制全文</>}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => generateReport(selectedModel.id)}
                  loading={generating[selectedModel.id]}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 重新生成
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {reportSections.map(section => (
                <div key={section.key} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[13px] font-medium text-gray-300">{section.title}</h4>
                    {section.score !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          'display text-2xl tabular',
                          section.score >= 8 ? 'text-emerald-300' :
                          section.score >= 6 ? 'text-amber-300' :
                          'text-red-300',
                        )}>
                          {section.score}
                        </span>
                        <span className="text-xs text-gray-500 mono">/ 10</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {section.content || <span className="text-gray-600">（暂无）</span>}
                  </p>
                </div>
              ))}
            </div>

            {/* 调整反馈 */}
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-sm text-gray-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                不满意？告诉 AI 怎么改：
              </p>
              <div className="flex gap-2">
                <Input
                  value={adjustText}
                  onChange={e => setAdjustText(e.target.value)}
                  placeholder="例如：综合评分调到 8.2 分，评论里加一段速度的描述"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
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
          </div>
        ) : selectedModel ? (
          <div className="p-12 text-center">
            <div className="inline-flex h-12 w-12 rounded-xl bg-white/[0.04] border border-white/10 items-center justify-center mb-3">
              <FileCheck2 className="h-6 w-6 text-cyan-300" />
            </div>
            <p className="text-sm text-gray-400 mb-4">还没有为 <span className="mono text-white">{selectedModel.modelCode}</span> 生成评估报告</p>
            <Button onClick={() => generateReport(selectedModel.id)} loading={generating[selectedModel.id]}>
              <Sparkles className="h-3.5 w-3.5" /> 生成评估报告
            </Button>
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