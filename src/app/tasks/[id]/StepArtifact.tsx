'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileText, Package,
  Plus, Trash2, UploadCloud, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Props {
  task: any
  onRefresh: () => void
}

export default function StepArtifact({ task, onRefresh }: Props) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [textContent, setTextContent] = useState('')
  const [uploadingModelId, setUploadingModelId] = useState<string | null>(null)
  const [addingText, setAddingText] = useState(false)
  const [newModelCode, setNewModelCode] = useState('')
  const [addingModel, setAddingModel] = useState(false)
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const noteTimerRef = useRef<number | null>(null)

  const models = task.models || []

  useEffect(() => () => {
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current)
  }, [])

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
      showNote('ok', `已上传 ${files.length} 个产物文件`)
      onRefresh()
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
      showNote('ok', '文本产物已添加')
      onRefresh()
    } finally {
      setAddingText(false)
    }
  }

  async function deleteArtifact(modelId: string, artifactId: string) {
    if (!askConfirm('删除文件', '确定删除此文件？')) return
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
      const addedCount = Array.isArray(data.models) ? data.models.length : codes.length
      setNewModelCode('')
      showNote(
        'ok',
        '已添加 ' + addedCount + ' 个模型' + (skipped.length ? '，跳过已存在：' + skipped.join('、') : ''),
      )
      onRefresh()
    } finally {
      setAddingModel(false)
    }
  }

  async function deleteModel(modelId: string) {
    if (!askConfirm('删除模型', '删除此模型及其所有产物、报告？')) return
    const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId, { method: 'DELETE' })
    const data = await readJsonResponse(res)
    if (!res.ok) {
      showNote('err', '删除失败: ' + (data.error || '未知错误'))
      return
    }
    onRefresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Package className="h-5 w-5 text-pink-300" />
        </div>
        <div>
          <h2 className="display text-xl">产物提交</h2>
          <p className="text-sm text-gray-400 mt-1">
            为每个待测模型上传或粘贴最终产物，第五阶段会基于这些产物生成正式评估报告。
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2">
        <Input
          value={newModelCode}
          onChange={event => setNewModelCode(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addModelManual()
            }
          }}
          placeholder="手动添加模型代号，多个用逗号分隔"
          className="mono max-w-lg"
        />
        <Button size="sm" onClick={addModelManual} loading={addingModel} disabled={!newModelCode.trim()}>
          <Plus className="h-3.5 w-3.5" /> 添加模型
        </Button>
        {models.length === 0 && (
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> AI 没识别到模型时，可以手动添加代号
          </div>
        )}
      </div>

      {note && (
        <div className={'flex items-start gap-2 px-4 py-2.5 rounded-lg border text-sm animate-rise select-text break-words ' + (note.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300')}>
          {note.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}

      {models.length === 0 ? (
        <div className="glass p-10 text-center text-sm text-gray-500 border-dashed">
          <Package className="h-8 w-8 mx-auto mb-3 text-gray-600" />
          暂无待测模型。先在第 3 步上传数据看板，或在上方手动添加模型代号。
        </div>
      ) : (
        <div className="grid gap-3">
          {models.map((model: any) => (
            <div key={model.id} className="glass p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="primary" className="mono">{model.modelCode}</Badge>
                  <button
                    onClick={() => deleteModel(model.id)}
                    className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                    title="删除此模型"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <span className="text-xs text-gray-500">
                    {model.artifacts?.length || 0} 个文件
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="subtle" size="sm" onClick={() => setSelectedModel(model.id)}>
                    <Plus className="h-3 w-3" /> 粘贴文本
                  </Button>
                  {uploadingModelId === model.id ? (
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
                        accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.zip"
                        onChange={(event) => handleFileUpload(event, model.id)}
                        disabled={uploadingModelId !== null}
                      />
                    </label>
                  )}
                </div>
              </div>

              {model.artifacts?.length > 0 ? (
                <div className="space-y-1">
                  {model.artifacts.map((artifact: any) => (
                    <div key={artifact.id} className="flex items-center justify-between text-sm bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 px-3 py-2 rounded-lg group transition-colors">
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
                <div className="text-xs text-gray-500 py-3 text-center border border-dashed border-white/[0.06] rounded-lg">
                  尚未上传该模型的产物
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedModel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade">
          <div className="glass-strong w-full max-w-lg p-5 animate-rise">
            <h3 className="font-medium text-white mb-3">粘贴产物文本</h3>
            <Textarea
              value={textContent}
              onChange={event => setTextContent(event.target.value)}
              rows={12}
              className="mono"
              placeholder="将模型输出的产物文本粘贴到这里..."
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
