'use client'
import { useState, useRef, useEffect } from 'react'
import {
  Image as ImageIcon, Camera, BarChart3, UploadCloud, X as XIcon,
  Sparkles, AlertTriangle, SkipForward, CheckCircle2, Lightbulb, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WorkingStatus } from '@/components/working-status'
import { JsonTable } from '@/components/JsonTable'
import { cn } from '@/lib/utils'

interface Props {
  task: any
  onRefresh: () => void
  onNext?: () => void
  onPrev?: () => void
}

type Tab = 'process' | 'dashboard'
type UploadedImage = { name: string; dataUrl: string }
type SavedImage = { id: string; name: string; url: string; size: number; uploadedAt: string }

const MAX_SCREENSHOTS_PER_TAB = 6
const MAX_SCREENSHOT_FILE_BYTES = 12 * 1024 * 1024
const MAX_SCREENSHOT_DATA_URL_LENGTH = 900_000
const MAX_ANALYSIS_IMAGES = 12
const MAX_ANALYSIS_PAYLOAD_LENGTH = 4_000_000

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片格式损坏或浏览器无法读取'))
    image.src = dataUrl
  })
}

function encodeScreenshotCanvas(canvas: HTMLCanvasElement): string {
  let quality = 0.92
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_SCREENSHOT_DATA_URL_LENGTH && quality > 0.52) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_LENGTH) {
    throw new Error('图片内容过于复杂，请先裁剪掉无关区域后重试')
  }
  return dataUrl
}

async function prepareScreenshot(file: File): Promise<string> {
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
    throw new Error(`${file.name} 不是支持的 PNG、JPG 或 WebP 图片`)
  }
  if (file.size <= 0 || file.size > MAX_SCREENSHOT_FILE_BYTES) {
    throw new Error(`${file.name} 大小不合法，单张图片不能超过 12MB`)
  }

  const source = await readFileAsDataUrl(file)
  const image = await loadImage(source)
  const maxEdge = 3200
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持图片压缩')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return encodeScreenshotCanvas(canvas)
}

function sanitizeVisionStreamPreview(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim()
}

function createWideImageTiles(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      const ratio = width / Math.max(height, 1)
      if (width < 1200 || ratio < 3.5) {
        resolve([])
        return
      }

      const tileCount = Math.min(4, Math.max(2, Math.ceil(ratio / 2.4)))
      const overlap = Math.round(width * 0.04)
      const baseTileWidth = Math.ceil(width / tileCount)
      const tiles: string[] = []

      for (let index = 0; index < tileCount; index++) {
        const start = Math.max(0, index * baseTileWidth - overlap)
        const end = Math.min(width, (index + 1) * baseTileWidth + overlap)
        const tileWidth = end - start
        const canvas = document.createElement('canvas')
        canvas.width = tileWidth
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) continue
        context.drawImage(image, start, 0, tileWidth, height, 0, 0, tileWidth, height)
        try {
          tiles.push(encodeScreenshotCanvas(canvas))
        } catch {
          resolve([])
          return
        }
      }

      resolve(tiles)
    }
    image.onerror = () => resolve([])
    image.src = dataUrl
  })
}

async function buildAnalysisImages(images: UploadedImage[], type: Tab): Promise<string[]> {
  const originals = images.map((image) => image.dataUrl)
  if (type !== 'dashboard') return validateAnalysisPayload(originals)

  const tiles = await Promise.all(images.map((image) => createWideImageTiles(image.dataUrl)))
  const expanded = images.flatMap((image, index) => tiles[index].length ? tiles[index] : [image.dataUrl])
  return validateAnalysisPayload(expanded)
}

function validateAnalysisPayload(images: string[]): string[] {
  if (images.length > MAX_ANALYSIS_IMAGES) {
    throw new Error(`自动裁剪后共有 ${images.length} 张图片，超过 ${MAX_ANALYSIS_IMAGES} 张上限，请减少原图数量`)
  }
  const totalLength = images.reduce((sum, image) => sum + image.length, 0)
  if (totalLength > MAX_ANALYSIS_PAYLOAD_LENGTH) {
    throw new Error('图片总数据量过大，请减少截图数量或进一步裁剪后重试')
  }
  return images
}

export default function StepScreenshot({ task, onRefresh, onNext, onPrev }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [processImages, setProcessImages] = useState<UploadedImage[]>([])
  const [dashboardImages, setDashboardImages] = useState<UploadedImage[]>([])
  const [savedProcessImages, setSavedProcessImages] = useState<SavedImage[]>([])
  const [savedDashboardImages, setSavedDashboardImages] = useState<SavedImage[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [skippedProcess, setSkippedProcess] = useState(false)
  const [streamText, setStreamText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Abort any in-flight screenshot analysis stream on unmount
  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const models = task.models || []

  async function loadSavedScreenshots() {
    if (!models || models.length === 0) {
      setLoadingSaved(false)
      return
    }
    // 取第一个有截图的模型的数据（同一任务同一 type 截图内容一致）
    try {
      for (const model of models) {
        const res = await fetch('/api/tasks/' + task.id + '/models/' + model.id + '/screenshots')
        if (!res.ok) continue
        const data = await res.json()
        const screenshots = data.screenshots || []
        if (screenshots.length > 0) {
          setSavedProcessImages(screenshots.filter((s: any) => s.type === 'process'))
          setSavedDashboardImages(screenshots.filter((s: any) => s.type === 'dashboard'))
          break
        }
      }
    } catch {
      // 加载失败静默处理
    } finally {
      setLoadingSaved(false)
    }
  }

  function stopAnalyze() {
    if (abortRef.current) abortRef.current.abort()
  }

  // 加载已保存的截图（只在 models 从无到有时加载一次）
  const loadedRef = useRef(false)
  useEffect(() => {
    if (loadedRef.current) return
    if (models.length === 0) return
    loadedRef.current = true
    void loadSavedScreenshots()
  }, [models.length])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, type: Tab) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    const existing = type === 'process' ? processImages : dashboardImages
    if (existing.length + files.length > MAX_SCREENSHOTS_PER_TAB) {
      setError(`每类截图最多上传 ${MAX_SCREENSHOTS_PER_TAB} 张`)
      return
    }

    try {
      const images: UploadedImage[] = []
      for (const file of files) {
        images.push({ name: file.name, dataUrl: await prepareScreenshot(file) })
      }
      if (type === 'process') setProcessImages(prev => [...prev, ...images])
      else setDashboardImages(prev => [...prev, ...images])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError))
    }
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
    const startTs = Date.now()
    setStartedAt(startTs)
    setAnalyzing(true); setResult(null); setError(null); setStreamText(''); setSaving(false)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const analysisImages = await buildAnalysisImages(images, activeTab)
      const res = await fetch('/api/tasks/' + task.id + '/analyze-screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: analysisImages, type: activeTab }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        let msg = '截图分析服务暂不可用，请稍后重试'
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
            setStreamText(sanitizeVisionStreamPreview(acc))
          } else if (eventName === 'done') {
            completed = true
            setSaving(true)
            if (payload.parsed?.models?.length) {
              await saveRecognizedRows(payload.parsed.models)
            }
            setResult({ parsed: payload.parsed, raw: payload.raw })
            // 分析完成后刷新已保存截图
            await loadSavedScreenshots()
          } else if (eventName === 'error') {
            throw new Error(payload.message || '视觉模型返回错误')
          }
        }
      }
      if (!completed && acc) setStreamText(acc)
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || String(e))
    } finally {
      setAnalyzing(false); setSaving(false); setStreamText(''); setStartedAt(undefined); abortRef.current = null
    }
  }

  function removeImage(type: Tab, index: number) {
    if (type === 'process') setProcessImages(prev => prev.filter((_, i) => i !== index))
    else setDashboardImages(prev => prev.filter((_, i) => i !== index))
  }

  const currentImages = activeTab === 'process' ? processImages : dashboardImages
  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-fuchsia-400/20 to-transparent blur-md" />
            <Camera className="h-5 w-5 text-fuchsia-300 relative z-10" />
          </div>
          <div>
            <h2 className="display text-xl sm:text-2xl tracking-tight">截图分析</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
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

      {/* Tip */}
      <div className="flex items-start gap-2 panel-inset p-3">
        <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-gray-400 leading-relaxed">
          <span className="text-gray-300 font-medium">操作指引：</span>
          切换到「数据看板」标签上传包含成功率、延迟等指标的看板截图 → 点击「AI 识别截图」等待分析完成。如果截图中没有自动识别到所有模型，可以手动添加。识别完成后进入下一步上传产物。
        </div>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/5">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium transition-all',
            activeTab === 'dashboard' ? 'bg-white/[0.08] text-white shadow-sm' : 'text-gray-400 hover:text-white',
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          数据看板
          <span className="text-red-400 text-[11px]">*</span>
        </button>
        <button
          onClick={() => setActiveTab('process')}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-[13px] font-medium transition-all',
            activeTab === 'process' ? 'bg-white/[0.08] text-white shadow-sm' : 'text-gray-400 hover:text-white',
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          执行过程
          <span className="text-gray-500 text-[11px]">可选</span>
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="panel px-4 py-3 text-sm text-gray-300 flex items-start gap-2 border-indigo-500/20">
            <BarChart3 className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-400" />
            <div>
              上传模型能力评估看板截图（工具调用次数、耗时、状态、成功率等），AI 会自动识别各模型代号与硬指标。
              识别后可在表格里点「编辑/补充」手动修正。
            </div>
          </div>
          {savedDashboardImages.length > 0 && (
            <SavedScreenshotGrid images={savedDashboardImages} label="已保存的看板截图" />
          )}
          <UploadBox label="数据看板" images={dashboardImages} onUpload={e => handleFile(e, 'dashboard')} onRemove={i => removeImage('dashboard', i)} accent="indigo" />
        </>
      ) : (
        <>
          <div className="panel px-4 py-3 text-sm flex items-start gap-2 border-amber-500/20 bg-amber-500/[0.03]">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-400" />
            <div>
              <div className="font-medium text-white mb-0.5">执行过程截图可选</div>
              <div className="text-gray-400">用于分析模型的对话轮次、工具调用轨迹、错误点等细节。没有可跳过。</div>
            </div>
          </div>
          {savedProcessImages.length > 0 && (
            <SavedScreenshotGrid images={savedProcessImages} label="已保存的过程截图" />
          )}
          <UploadBox label="执行过程" images={processImages} onUpload={e => handleFile(e, 'process')} onRemove={i => removeImage('process', i)} accent="amber" />
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
        <div className="panel px-4 py-3 text-sm text-red-300 flex items-start gap-2 border-red-500/25 bg-red-500/[0.04]">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {analyzing && (
        <WorkingStatus
          phase={saving ? '正在保存识别结果...' : '正在识别截图内容...'}
          hint={saving ? '写入数据库' : `${streamText.length} 字`}
          startedAt={startedAt}
          onCancel={stopAnalyze}
          dotColor={saving ? 'emerald' : 'fuchsia'}
        />
      )}

      {analyzing && streamText && (
        <div className="panel p-4 max-h-40 overflow-y-auto scrollbar-thin text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {streamText}
          <span className="inline-block w-1.5 h-4 bg-fuchsia-400 animate-pulse align-middle ml-0.5" />
        </div>
      )}

      {currentImages.length > 0 && !analyzing && (
        <div className="flex items-center gap-3">
          <Button onClick={analyze}>
            <Sparkles className="h-3.5 w-3.5" />
            开始 AI 分析
          </Button>
          <span className="text-xs text-gray-500">分析需要 10-30 秒，可随时停止</span>
        </div>
      )}

      {result && activeTab === 'dashboard' && (
        result.parsed?.models?.length
          ? <div className="panel p-4"><JsonTable text={result.raw || JSON.stringify(result.parsed)} onSave={saveRecognizedRows} /></div>
          : (
            <div className="panel p-6 text-center text-sm text-amber-300 border-amber-500/20">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 opacity-60" />
              <div className="font-medium">AI 未能识别到结构化数据</div>
              <div className="text-xs text-gray-400 mt-1">试试更清晰的截图，或在产物分析步骤手动添加指标</div>
            </div>
          )
      )}

      {result && activeTab === 'process' && result.parsed?.models?.length > 0 && (
        <div className="panel p-4"><JsonTable text={result.raw || JSON.stringify(result.parsed)} onSave={saveRecognizedRows} /></div>
      )}

      {/* Next step button */}
      {(onPrev || onNext) && !analyzing && (
        <div className="flex items-center gap-3 pt-1">
          {onPrev && (
            <Button onClick={onPrev} variant="ghost">
              ← 返回任务信息
            </Button>
          )}
          <div className="flex-1" />
          {onNext && task.models && task.models.length > 0 && (
            <Button onClick={onNext}>
              下一步：上传产物 <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {onNext && task.models && task.models.length === 0 && ((result !== null && dashboardImages.length > 0) || dashboardImages.length === 0) && (
            <Button onClick={onNext} variant="secondary">
              继续：上传产物 <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      )}
      {onNext && task.models && task.models.length === 0 && !analyzing && ((result !== null && dashboardImages.length > 0) || dashboardImages.length === 0) && (
        <div className="flex items-start gap-2 mt-2">
          <span className="text-xs text-amber-400/80 leading-relaxed">
            {dashboardImages.length === 0
              ? '提示：未上传截图，将在下一步手动添加模型代号'
              : '提示：AI 未识别到模型，可在下一步手动添加模型代号'
            }
          </span>
        </div>
      )}
    </div>
  )
}

function UploadBox({ label, images, onUpload, onRemove, accent }: {
  label: string
  images: UploadedImage[]
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: (i: number) => void
  accent: 'indigo' | 'amber'
}) {
  const hoverBorder = accent === 'indigo' ? 'hover:border-indigo-400/50' : 'hover:border-amber-400/50'
  const hoverText = accent === 'indigo' ? 'group-hover:text-indigo-300' : 'group-hover:text-amber-300'
  const iconColor = accent === 'indigo' ? 'text-indigo-300' : 'text-amber-300'
  return (
    <div className="space-y-3">
      <label className={cn(
        'flex items-center justify-center w-full h-28 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/[0.02] transition-colors group',
        hoverBorder,
      )}>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onUpload} />
        <div className="text-center">
          <UploadCloud className={cn('h-7 w-7 mx-auto text-gray-500 transition-colors mb-1', hoverText)} />
          <span className="text-sm text-gray-400 group-hover:text-white transition-colors">
            点击上传{label}截图（可多张）
          </span>
          <div className="text-xs text-gray-400 mt-0.5 mono">PNG · JPG · WebP，最多 {MAX_SCREENSHOTS_PER_TAB} 张</div>
        </div>
      </label>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-white/10 group">
              <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                <div className="text-[10px] text-gray-300 truncate">{img.name}</div>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 hover:bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-sm"
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

function SavedScreenshotGrid({ images, label }: { images: SavedImage[]; label: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        {label}（{images.length} 张，点击查看原图）
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {images.map((img) => (
          <a
            key={img.id}
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-video rounded-lg overflow-hidden border border-emerald-500/20 group"
          >
            <img src={img.url} alt={img.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
              <div className="text-[10px] text-gray-300 truncate">{img.name}</div>
            </div>
            <div className="absolute top-1.5 right-1.5 px-1.5 h-5 bg-black/60 rounded text-[10px] text-emerald-300 opacity-0 group-hover:opacity-100 transition backdrop-blur-sm flex items-center">
              查看原图
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
