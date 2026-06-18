'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Package, UploadCloud, X, FileText, Trash2, Sparkles, Plus, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea, Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MarkdownView } from '@/components/MarkdownView'

interface Props {
  task: any
  onAddMessage: (msg: any) => void
  onRefresh: () => void
}

export default function StepArtifact({ task, onAddMessage, onRefresh }: Props) {
  const [analysis, setAnalysis] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [textContent, setTextContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [newModelCode, setNewModelCode] = useState('')
  const [addingModel, setAddingModel] = useState(false)
  const [note, setNote] = useState<{ type: 'ok'|'err'; text: string } | null>(null)

  const models = task.models || []

  useEffect(() => {
    if (task.analysisJson) {
      try {
        const parsed = JSON.parse(task.analysisJson)
        setAnalysis(parsed.content || '')
      } catch {}
    }
  }, [task.analysisJson])

  async function analyze() {
    if (models.length === 0) {
      setNote({ type: 'err', text: '还没有模型，请先在第 3 步上传看板截图识别模型' }); setTimeout(() => setNote(null), 4000)
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch('/api/tasks/' + task.id + '/analyze-artifacts', { method: 'POST' })
      const data = await res.json()
      if (data.analysis) {
        setAnalysis(data.analysis)
        onAddMessage({ id: 'a-' + Date.now(), role: 'assistant', content: data.analysis, step: 'ARTIFACT' })
      } else if (data.error) {
        alert(data.error)
      }
    } finally { setAnalyzing(false) }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, modelId: string) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))
      const res = await fetch('/api/tasks/' + task.id + '/models/' + modelId + '/artifacts', {
        method: 'POST', body: formData,
      })
      if (res.ok) onRefresh()
      else { const data = await res.json(); setNote({ type: 'err', text: '上传失败: ' + (data.error || '未知错误') }); setTimeout(() => setNote(null), 4000) }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function addTextArtifact() {
    if (!selectedModel || !textContent.trim()) return
    const res = await fetch('/api/tasks/' + task.id + '/models/' + selectedModel + '/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '文本内容.txt', textContent }),
    })
    if (res.ok) {
      setTextContent(''); setSelectedModel(null); onRefresh()
    }
  }

  async function deleteArtifact(modelId: string, artifactId: string) {
    if (!confirm('确定删除此文件？')) return
    await fetch('/api/tasks/' + task.id + '/models/' + modelId + '/artifacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactId }),
    })
    onRefresh()
  }  async function addModelManual() {
    const code = newModelCode.trim().toUpperCase();
    if (!code) return;
    if (models.find((m: any) => m.modelCode.toUpperCase() === code)) {
      setNote({ type: 'err', text: '模型 ' + code + ' 已存在' }); setTimeout(() => setNote(null), 3000);
      return;
    }
    setAddingModel(true);
    try {
      const res = await fetch('/api/tasks/' + task.id + '/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelCodes: [code] }),
      });
      if (res.ok) {  let d; try { d = await res.json(); } catch { d = null; } if (d) { setNewModelCode(''); onRefresh(); } else { setNewModelCode(''); onRefresh(); } }
      else { let d; try { d = await res.json(); } catch { throw new Error('服务器返回了非预期内容'); } setNote({ type: 'err', text: '添加失败：' + (d.error || '未知错误') }); setTimeout(() => setNote(null), 4000); }
    } finally { setAddingModel(false); }
  }

  async function deleteModel(modelId: string) {
    if (!confirm('删除此模型及其所有产物/报告？')) return;
    await fetch('/api/tasks/' + task.id + '/models/' + modelId, { method: 'DELETE' });
    onRefresh();
  }
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Package className="h-5 w-5 text-pink-300" />
        </div>
        <div>
          <h2 className="display text-xl">产物分析</h2>
          <p className="text-sm text-gray-400 mt-1">
            为每个待测模型上传产物文件（PDF / Word / Excel / PPT / ZIP / 文本均可），AI 服务端解析内容后做对比分析。
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2">
        <Input
          value={newModelCode}
          onChange={e => setNewModelCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModelManual(); } }}
          placeholder="手动添加模型代号（多个用英文逗号分隔）"
          className="mono max-w-lg"
        />
        <Button size="sm" onClick={addModelManual} loading={addingModel} disabled={!newModelCode.trim()}>
          <Plus className="h-3.5 w-3.5" /> 添加模型
        </Button>
        {models.length === 0 && (
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> AI 没识别到？手动输入代号即可
          </div>
        )}
      </div>

      {models.length === 0 ? (
        <div className="glass p-10 text-center text-sm text-gray-500 border-dashed">
          <Package className="h-8 w-8 mx-auto mb-3 text-gray-600" />
          暂无待测模型。先在第 3 步上传数据看板，AI 会自动识别模型代号。

      {note && (
        <div className={'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm animate-rise ' + (note.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300')}>
          {note.type === 'ok' ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
          {note.text}
        </div>
      )}
        </div>
      ) : (
        <div className="grid gap-3">
          {models.map((m: any) => (
            <div key={m.id} className="glass p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="primary" className="mono">{m.modelCode}</Badge>
                  <button onClick={() => deleteModel(m.id)} className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors" title="删除此模型">
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <span className="text-xs text-gray-500">
                    {m.artifacts?.length || 0} 个文件
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="subtle" size="sm" onClick={() => setSelectedModel(m.id)}>
                    <Plus className="h-3 w-3" /> 粘贴文本
                  </Button>
                  <label className={`inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                    uploading ? 'opacity-50 pointer-events-none' : ''
                  } text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10`}>
                    <UploadCloud className="h-3 w-3" />
                    {uploading ? '上传中...' : '上传文件'}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.zip"
                      onChange={(e) => handleFileUpload(e, m.id)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              {m.artifacts?.length > 0 ? (
                <div className="space-y-1">
                  {m.artifacts.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-sm bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 px-3 py-2 rounded-lg group transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                        <span className="text-gray-300 truncate">{a.name}</span>
                      </div>
                      <button
                        onClick={() => deleteArtifact(m.id, a.id)}
                        className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0 p-1"
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
              onChange={e => setTextContent(e.target.value)}
              rows={12}
              className="mono"
              placeholder="将模型输出的产物文本粘贴到这里..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedModel(null); setTextContent('') }}>取消</Button>
              <Button size="sm" onClick={addTextArtifact} disabled={!textContent.trim()}>添加</Button>
            </div>
          </div>
        </div>
      )}

      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-medium text-white">综合对比分析</h3>
            <p className="text-xs text-gray-500 mt-0.5">基于所有模型的产物 + 任务上下文，生成结构化对比</p>
          </div>
          <Button onClick={analyze} loading={analyzing} disabled={models.length === 0}>
            <Sparkles className="h-3.5 w-3.5" />
            {analyzing ? 'AI 分析中...' : '开始 AI 分析'}
          </Button>
        </div>

        {analysis ? (
          <div className="glass p-4 max-h-96 overflow-y-auto scrollbar-thin">
            <MarkdownView text={analysis} />
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-white/[0.06] rounded-lg">
            <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-gray-600" />
            上传各模型产物后，点击上方按钮进行 AI 整体对比分析
          </div>
        )}
      </div>
    </div>
  )
}