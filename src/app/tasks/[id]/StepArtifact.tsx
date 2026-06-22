'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileText, Package,
  Plus, Sparkles, Trash2, UploadCloud, Loader2, X, Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  FILE_ANALYSIS_LIMIT,
  FILE_ANALYSIS_CHAR_LIMIT,
  isFreshModelArtifactAnalysis,
  parseStoredModelArtifactAnalysis,
} from '@/lib/model-artifact-analysis'
import { ArtifactAnalysisTrace } from '@/components/tasks/ArtifactAnalysisTrace'

interface Props {
  task: any
  onRefresh: () => void
}

export default function StepArtifact({ task, onRefresh }: Props) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [textContent, setTextContent] = useState('')
  const [uploadingModelId, setUploadingModelId] = useState<string | null>(null)
  const [startingModelId, setStartingModelId] = useState<string | null>(null)
  const [addingText, setAddingText] = useState(false)
  const [newModelCode, setNewModelCode] = useState('')
  const [addingModel, setAddingModel] = useState(false)
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const noteTimerRef = useRef<number | null>(null)
  const models = task.models || []
  const hasRunningAnalysis = models.some((model: any) => {
    const status = model.artifactAnalysisRuns?.[0]?.status
    return status === 'QUEUED' || status === 'RUNNING'
  })

  useEffect(() => () => {
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current)
  }, [])

  useEffect(() => {
    if (!hasRunningAnalysis) return
    const timer = window.setInterval(onRefresh, 1_500)
    return () => window.clearInterval(timer)
  }, [hasRunningAnalysis, onRefresh])

  function askConfirm(title: string, message: string): boolean {
    return window.confirm(title + '\n\n' + message)
  }

  function showNote(type: 'ok' | 'err', text: string, timeout = type === 'err' ? 15000 : 4000) {
    if (noteTimerRef.current) {
      window.clearTimeout(noteTimerRef.current)
      noteTimerRef.current = null
    }
    setNote({ type, text })
    noteTimerRef.current = window.setTimeout(() => {
      setNote(null)
      noteTimerRef.current = null
    }, timeout)
  }

  async function readJsonResponse(res: Response) {
    const text = await res.text().catch(() => '')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { error: text.slice(0, 300) || '服务器返回了非预期内容' }
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, modelId: string) {
    const input = e.currentTarget
    const files = Array.from(input.files || [])
    if (files.length === 0) return

    setUploadingModelId(modelId)
    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId + '/artifacts', {
        method: 'POST',
        body: formData,
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', '上传失败: ' + (data.error || '未知错误'))
        return
      }
      showNote('ok', `已上传 ${files.length} 个产物文件，正在自动提交预分析`)
      await analyzeModelArtifacts(modelId, { automatic: true })
    } catch {
      showNote('err', '上传失败：网络异常，请稍后重试')
    } finally {
      setUploadingModelId(null)
      input.value = ''
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function addTextArtifact() {
    if (!selectedModel || !textContent.trim()) return
    setAddingText(true)
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models/' + selectedModel + '/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '文本内容.txt', textContent }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', '添加文本失败: ' + (data.error || '未知错误'))
        return
      }
      setTextContent('')
      setSelectedModel(null)
      showNote('ok', '文本产物已添加，正在自动提交预分析')
      await analyzeModelArtifacts(selectedModel, { automatic: true })
    } catch {
      showNote('err', '添加文本失败：网络异常，请稍后重试')
    } finally {
      setAddingText(false)
    }
  }

  async function deleteArtifact(modelId: string, artifactId: string) {
    if (!askConfirm('删除文件', '确定删除此文件？')) return
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId + '/artifacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', '删除失败: ' + (data.error || '未知错误'))
        return
      }
      onRefresh()
    } catch {
      showNote('err', '删除失败：网络异常，请稍后重试')
    }
  }

  async function analyzeModelArtifacts(modelId: string, options: { automatic?: boolean } = {}) {
    setStartingModelId(modelId)
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId + '/artifact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', (options.automatic ? '自动预分析失败: ' : '预分析失败: ') + (data.error || '未知错误'))
        return
      }
      showNote(
        'ok',
        data.alreadyRunning
          ? '该模型正在后台分析，轨迹会自动更新。'
          : options.automatic
            ? '已自动提交后台产物分析，拆解轨迹会自动更新。'
            : '已提交后台产物分析，拆解轨迹会自动更新。有验证截图的模型将自动生成评估报告。',
      )
      onRefresh()
    } catch {
      showNote('err', (options.automatic ? '自动预分析' : '预分析') + '失败：网络异常，请稍后重试')
    } finally {
      setStartingModelId(null)
    }
  }

  async function addModelManual() {
    const inputCodes = [...new Set(
      newModelCode
        .split(/[,，、\s]+/)
        .map(code => code.trim().toUpperCase())
        .filter(Boolean),
    )]
    if (inputCodes.length === 0) return

    const existingCodes = new Set(models.map((model: any) => model.modelCode.toUpperCase()))
    const codes = inputCodes.filter(code => !existingCodes.has(code))
    const skipped = inputCodes.filter(code => existingCodes.has(code))

    if (codes.length === 0) {
      showNote('err', '模型 ' + skipped.join('、') + ' 已存在', 3000)
      return
    }

    setAddingModel(true)
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelCodes: codes }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', '添加失败: ' + (data.error || '未知错误'))
        return
      }
      const addedCount = typeof data.addedCount === 'number'
        ? data.addedCount
        : Array.isArray(data.models) ? data.models.length : codes.length
      setNewModelCode('')
      showNote(
        'ok',
        '已添加 ' + addedCount + ' 个模型' + (skipped.length ? '，跳过已存在：' + skipped.join('、') : ''),
      )
      onRefresh()
    } catch {
      showNote('err', '添加失败：网络异常，请稍后重试')
    } finally {
      setAddingModel(false)
    }
  }

  async function deleteModel(modelId: string) {
    if (!askConfirm('删除模型', '删除此模型及其所有产物、报告？')) return
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId, { method: 'DELETE' })
      const data = await readJsonResponse(res)
      if (!res.ok) {
        showNote('err', '删除失败: ' + (data.error || '未知错误'))
        return
      }
      onRefresh()
    } catch {
      showNote('err', '删除失败：网络异常，请稍后重试')
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-start gap-3">
        <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-pink-400/20 to-transparent blur-md" />
          <Package className="h-5 w-5 text-pink-300 relative z-10" />
        </div>
        <div>
          <h2 className="display text-xl sm:text-2xl tracking-tight">产物提交</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            为每个待测模型上传最终产物（ZIP 源码包、输出文档、截图等），或直接粘贴文本输出。
            上传后系统会自动解析文件内容（约 1–3 分钟），作为 AI 撰写评估报告的依据。
          </p>
        </div>
      </div>

      {/* Tip */}
      <div className="flex items-start gap-2 panel-inset p-3">
        <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-gray-400 leading-relaxed">
          <span className="text-gray-300 font-medium">操作指引：</span>
          为每个模型上传产物文件（支持 ZIP、代码文件、文本、Markdown 等），或直接粘贴模型的文本输出。所有模型产物添加完成后，点击「AI 分析产物」等待分析完成。分析完成后即可生成最终评估报告。
        </div>
      </div>

      <div className="panel p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            value={newModelCode}
            onChange={event => setNewModelCode(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addModelManual()
              }
            }}
            placeholder="手动添加模型代号，如 GPT4O、CLAUDE-3、DEEPSEEK，多个用逗号分隔"
            className="mono flex-1 bg-white/[0.02] border-white/[0.07]"
          />
          <Button size="sm" onClick={addModelManual} loading={addingModel} disabled={!newModelCode.trim()}>
            <Plus className="h-3.5 w-3.5" /> 添加模型
          </Button>
        </div>
        {models.length === 0 && (
          <div className="mt-2.5 text-[11px] text-gray-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            如果 AI 没有自动识别到模型，可以在此手动输入模型代号（例如 GPT4O、CLAUDE-3-5-SONNET 等）
          </div>
        )}
      </div>

      {note && (
        <div className={'flex items-start gap-2 px-4 py-2.5 rounded-xl border text-sm animate-rise select-text break-words ' + (note.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300')}>
          {note.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}

      {models.length === 0 ? (
        <div className="panel p-10 text-center">
          <div className="relative inline-flex mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-rose-500/20 blur-xl rounded-full" />
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-500/15 to-rose-500/15 border border-white/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-pink-300" />
            </div>
          </div>
          <p className="text-[13px] text-gray-400 mb-1">暂无待测模型</p>
          <p className="text-[11px] text-gray-600">
            请先在「看板识别」步骤上传数据看板截图，AI 会自动识别模型代号；
            或使用上方输入框手动添加。
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {models.map((model: any) => {
            const artifactCount = model.artifacts?.length || 0
            const isUploading = uploadingModelId === model.id
            const latestAnalysisRun = model.artifactAnalysisRuns?.[0] || null
            const isAnalyzing = startingModelId === model.id || latestAnalysisRun?.status === 'QUEUED' || latestAnalysisRun?.status === 'RUNNING'
            const artifactAnalysis = parseStoredModelArtifactAnalysis(model.artifactAnalysisJson)
            const hasFreshAnalysis = isFreshModelArtifactAnalysis(artifactAnalysis, model.artifacts || [])
            const hasStaleAnalysis = Boolean(artifactAnalysis && !hasFreshAnalysis)
            return (
              <div key={model.id} className="panel p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="mono px-2.5 py-1 rounded-lg bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-500/30 text-[12px] font-medium text-pink-200">
                      {model.modelCode}
                    </span>
                    <button
                      onClick={() => deleteModel(model.id)}
                      className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                      title="删除此模型"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <Badge variant="muted" className="text-[10px]">
                      {artifactCount} 个文件
                    </Badge>
                    {hasFreshAnalysis && (
                      <Badge variant="success" className="text-[10px]">已预分析</Badge>
                    )}
                    {hasStaleAnalysis && (
                      <Badge variant="warn" className="text-[10px]">需重新分析</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={hasFreshAnalysis ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => analyzeModelArtifacts(model.id)}
                       loading={startingModelId === model.id}
                       loadingText="正在提交..."
                       disabled={artifactCount === 0 || isUploading || isAnalyzing}
                    >
                      <Sparkles className="h-3 w-3" /> {isAnalyzing ? '后台分析中' : hasFreshAnalysis ? '重新分析' : '开始产物分析'}
                    </Button>
                    <Button variant="subtle" size="sm" onClick={() => setSelectedModel(model.id)} title="如果模型输出是纯文本（如代码、Markdown），可直接粘贴而无需打包成文件">
                      <Plus className="h-3 w-3" /> 粘贴文本
                    </Button>
                    {isUploading ? (
                      <span className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-indigo-300">
                        <Loader2 className="h-3 w-3 animate-spin" /> 上传中...
                      </span>
                    ) : (
                      <label className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg cursor-pointer transition-colors text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10">
                        <UploadCloud className="h-3 w-3" />
                        上传文件
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          multiple
                          accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.markdown,.csv,.json,.jsonl,.log,.xml,.html,.htm,.yaml,.yml,.zip,.png,.jpg,.jpeg,.webp,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.css,.scss,.sql,.sh,.ps1"
                          onChange={(event) => handleFileUpload(event, model.id)}
                           disabled={uploadingModelId !== null || isAnalyzing}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {artifactCount > 0 ? (
                  <div className="space-y-1.5">
                    {model.artifacts.map((artifact: any) => (
                      <div key={artifact.id} className="flex items-center justify-between text-[13px] bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] px-3 py-2 rounded-lg group transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                          <span className="text-gray-300 truncate">{artifact.name}</span>
                        </div>
                        <button
                          onClick={() => deleteArtifact(model.id, artifact.id)}
                          className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0 p-1"
                          title="删除文件"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 py-4 text-center border border-dashed border-white/[0.06] rounded-lg space-y-1">
                    <p>尚未上传该模型的产物</p>
                    <p className="text-gray-600 px-3">
                      点击「上传文件」选择 ZIP / 代码 / 文档 / 图片，或「粘贴文本」直接粘贴模型输出内容，
                      上传后会自动开始产物预分析。
                    </p>
                  </div>
                )}
                <ArtifactAnalysisTrace run={latestAnalysisRun} modelCode={model.modelCode} />
                {latestAnalysisRun?.status === 'COMPLETED' && model.artifacts && model.artifacts.length > FILE_ANALYSIS_LIMIT && (
                  <div className="mt-2 text-[11px] text-gray-500 leading-relaxed px-1">
                    深度分析覆盖前 {FILE_ANALYSIS_LIMIT} 个主要文件，每文件约 {(FILE_ANALYSIS_CHAR_LIMIT / 1000).toFixed(0)}k 字符。其余文件已列入清单但未做逐文件深度分析。
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedModel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade">
          <div className="panel w-full max-w-lg p-5 animate-rise" style={{ background: 'rgba(15,15,20,0.9)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-300" />
                粘贴产物文本
              </h3>
              <button
                onClick={() => { setSelectedModel(null); setTextContent('') }}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Textarea
              value={textContent}
              onChange={event => setTextContent(event.target.value)}
              rows={12}
              className="mono bg-white/[0.02] border-white/[0.07] focus:bg-white/[0.03]"
              placeholder="将模型输出的文本内容粘贴到这里，例如模型生成的代码、回答文本、Markdown 文档等..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" disabled={addingText} onClick={() => { setSelectedModel(null); setTextContent('') }}>取消</Button>
              <Button size="sm" onClick={addTextArtifact} loading={addingText} loadingText="添加中..." disabled={!textContent.trim()}>添加</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
