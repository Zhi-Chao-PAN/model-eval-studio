'use client'
import { useState, useRef } from 'react'
import {
  Image as ImageIcon, Camera, BarChart3, UploadCloud, X as XIcon,
  Sparkles, AlertTriangle, SkipForward, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { JsonTable } from '@/components/JsonTable'
import { cn } from '@/lib/utils'

interface Props {
  task: any
  onRefresh: () => void
}

type Tab = 'process' | 'dashboard'

export default function StepScreenshot({ task, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [processImages, setProcessImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [dashboardImages, setDashboardImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [skippedProcess, setSkippedProcess] = useState(false)
  const [streamText, setStreamText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, type: Tab) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setError(null)
    const images = await Promise.all(files.map(async f => ({
      name: f.name, dataUrl: await fileToDataUrl(f),
    })))
    if (type === 'process') setProcessImages(prev => [...prev, ...images])
    else setDashboardImages(prev => [...prev, ...images])
    e.target.value = ''
  }

  async function readJsonResponse(res: Response): Promise<any> {
    const text = await res.text().catch(() => '')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { error: text.slice(0, 300) || '服务器返回了非预期内容' }
    }
  }

  async function saveRecognizedRows(rows: any[]) {
    const modelByCode = new Map<string, any>(
      models.map((model: any) => [model.modelCode.toUpperCase(), model]),
    )
    const missingCodes = rows
      .map((row) => String(row.modelCode || '').trim().toUpperCase())
      .filter((code) => code && !modelByCode.has(code))

    if (missingCodes.length > 0) {
      const createRes = await fetch('/api/tasks/' + task.id + '/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelCodes: missingCodes }),
      })
      const createData = await readJsonResponse(createRes)
      if (!createRes.ok) throw new Error(createData.error || '模型创建失败')
      for (const model of createData.models || []) {
        modelByCode.set(model.modelCode.toUpperCase(), model)
      }
    }

    for (const row of rows) {
      const code = String(row.modelCode || '').trim().toUpperCase()
      const model = modelByCode.get(code)
      if (!model) continue
      const res = await fetch('/api/tasks/' + task.id + '/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          displayName: row.displayName || row.modelCode,
          hardMetricsJson: JSON.stringify(row.metrics || {}),
        }),
      })
      const data = await readJsonResponse(res)
      if (!res.ok) throw new Error(data.error || '模型指标保存失败')
    }

    onRefresh()
  }

  async function analyze() {
  const images = activeTab === 'process' ? processImages : dashboardImages
  if (images.length === 0) { setError('请先上传至少 1 张图片'); return }
  setAnalyzing(true); setResult(null); setError(null); setStreamText('')
  const controller = new AbortController()
  abortRef.current = controller
  try {
  const res = await fetch('/api/tasks/' + task.id + '/analyze-screenshots', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ images: images.map((i) => i.dataUrl), type: activeTab }),
  signal: controller.signal,
  })
  if (!res.ok || !res.body) {
  const txt = await res.text().catch(() => '')
  let msg = '分析失败（HTTP ' + res.status + '）'
  try {
  const j = JSON.parse(txt)
  if (j.error || j.message) msg = j.error || j.message
  } catch {}
  throw new Error(msg)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  let completed = false
  while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const events = buffer.split('\n\n')
  buffer = events.pop() || ''
  for (const ev of events) {
  let eventName = 'message'
  let dataLine = ''
  for (const line of ev.split('\n')) {
  if (line.startsWith('event:')) eventName = line.slice(6).trim()
  else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
  }
  if (!dataLine) continue
  let payload: any
  try {
  payload = JSON.parse(dataLine)
  } catch {
  continue
  }
  if (eventName === 'delta' && payload.text) {
  acc += payload.text
  setStreamText(acc)
  } else if (eventName === 'done') {
  completed = true
  setResult({ parsed: payload.parsed, raw: payload.raw })
  onRefresh()
  } else if (eventName === 'error') {
  throw new Error(payload.message || '视觉模型返回错误')
  }
  }
  }
  if (!completed && acc) setStreamText(acc)
  } catch (e: any) {
  if (e.name !== 'AbortError') setError(e.message || String(e))
  } finally {
  setAnalyzing(false); setStreamText(''); abortRef.current = null
  }
  }

  function removeImage(type: Tab, index: number) {
    if (type === 'process') setProcessImages(prev => prev.filter((_, i) => i !== index))
    else setDashboardImages(prev => prev.filter((_, i) => i !== index))
  }

  const models = task.models || []
  const currentImages = activeTab === 'process' ? processImages : dashboardImages
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
            <Camera className="h-5 w-5 text-fuchsia-300" />
          </div>
          <div>
            <h2 className="display text-xl">截图分析</h2>
            <p className="text-sm text-gray-400 mt-1">
              上传数据看板（必填）+ 执行过程（可选），AI 自动识别模型代号与硬指标。
            </p>
          </div>
        </div>
        {models.length > 0 && (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 已识别 {models.length} 个模型
          </Badge>
        )}
      </div>

      <div className="inline-flex p-1 rounded-lg bg-white/[0.04] border border-white/5">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-all',
            activeTab === 'dashboard' ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-white',
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          数据看板
          <span className="text-red-400 text-[11px]">*</span>
        </button>
        <button
          onClick={() => setActiveTab('process')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-all',
            activeTab === 'process' ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-white',
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          执行过程
          <span className="text-gray-500 text-[11px]">可选</span>
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="glass px-4 py-3 text-sm text-gray-300 flex items-start gap-2 border-indigo-500/20 bg-indigo-500/5">
            <BarChart3 className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-400" />
            <div>
              上传模型能力评估看板截图（工具调用次数、耗时、状态、成功率等），AI 会自动识别各模型代号与硬指标。
              识别后可在表格里点「编辑/补充」手动修正。
            </div>
          </div>
          <UploadBox label="数据看板" images={dashboardImages} onUpload={e => handleFile(e, 'dashboard')} onRemove={i => removeImage('dashboard', i)} />
        </>
      ) : (
        <>
          <div className="glass px-4 py-3 text-sm text-gray-300 flex items-start gap-2 border-amber-500/20 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
            <div>
              <div className="font-medium text-white mb-0.5">执行过程截图可选</div>
              <div className="text-gray-400">用于分析模型的对话轮次、工具调用轨迹、错误点等细节。没有可跳过。</div>
            </div>
          </div>
          <UploadBox label="执行过程" images={processImages} onUpload={e => handleFile(e, 'process')} onRemove={i => removeImage('process', i)} />
          {processImages.length === 0 && (
            <Button
              variant={skippedProcess ? 'subtle' : 'secondary'}
              size="sm"
              onClick={() => setSkippedProcess(true)}
            >
              <SkipForward className="h-3.5 w-3.5" />
              {skippedProcess ? '已跳过此步' : '跳过执行过程截图'}
            </Button>
          )}
        </>
      )}

      {error && (
        <div className="glass px-4 py-3 text-sm text-red-300 flex items-start gap-2 border-red-500/20">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {analyzing && streamText && (
        <div className="glass p-4 max-h-40 overflow-y-auto scrollbar-thin text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {streamText}
        </div>
      )}

            {currentImages.length > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={analyze} loading={analyzing}>
            <Sparkles className="h-3.5 w-3.5" />
            {analyzing ? 'AI 分析中...' : '开始 AI 分析'}
          </Button>
          <span className="text-xs text-gray-500">分析需要 10-30 秒，请耐心等待</span>
        </div>
      )}

      {result && activeTab === 'dashboard' && (
        result.parsed?.models?.length
          ? <JsonTable text={result.raw || JSON.stringify(result.parsed)} onSave={saveRecognizedRows} />
          : (
            <div className="glass p-6 text-center text-sm text-amber-300 border-amber-500/20">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 opacity-60" />
              <div className="font-medium">AI 未能识别到结构化数据</div>
              <div className="text-xs text-gray-400 mt-1">试试更清晰的截图，或在产物分析步骤手动添加指标</div>
            </div>
          )
      )}

      {result && activeTab === 'process' && result.parsed?.models?.length > 0 && (
        <JsonTable text={result.raw || JSON.stringify(result.parsed)} onSave={saveRecognizedRows} />
      )}
    </div>
  )
}

function UploadBox({ label, images, onUpload, onRemove }: {
  label: string
  images: { name: string; dataUrl: string }[]
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-indigo-400/60 hover:bg-white/[0.02] transition-colors group">
        <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
        <div className="text-center">
          <UploadCloud className="h-7 w-7 mx-auto text-gray-500 group-hover:text-indigo-300 transition-colors mb-1" />
          <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
            点击上传{label}截图（可多张）
          </span>
          <div className="text-xs text-gray-600 mt-0.5 mono">PNG · JPG · WebP</div>
        </div>
      </label>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group">
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/70 hover:bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
