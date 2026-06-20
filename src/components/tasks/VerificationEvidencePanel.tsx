'use client'

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, ExternalLink, Eye, FileImage, FileText,
  Loader2, MonitorUp, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  isAuthenticVerificationEvidence,
  MAX_VERIFICATION_EVIDENCE,
  parseVerificationEvidence,
  serializeVerificationEvidence,
  type VerificationEvidence,
} from '@/lib/verification-evidence'
import {
  buildLegacyArchivePreview,
  buildPreviewFrameDocument,
  parseStoredArtifactPreview,
} from '@/lib/artifact-preview'

type ArtifactLike = {
  id: string
  name: string
  url?: string | null
  mimeType?: string | null
  parsedText?: string | null
  textContent?: string | null
  size?: number | null
  previewJson?: string | null
}

type ModelLike = {
  id: string
  modelCode: string
  artifacts?: ArtifactLike[]
  verificationScreenshotUrls?: string | null
}

interface Props {
  taskId: string
  model: ModelLike
  fallbackEvidenceRaw?: string | null
  onRefresh: () => void
  onNotice: (type: 'ok' | 'err', text: string) => void
}

const MAX_PREVIEW_TEXT_LENGTH = 60_000

function looksLikeParserPlaceholder(text: string): boolean {
  const value = text.trim()
  return value.startsWith('[无法解析') || value.startsWith('[文件解析失败') || value.startsWith('[图片文件过大')
}

function artifactText(artifact: ArtifactLike): string {
  const value = (artifact.textContent || artifact.parsedText || '').trim()
  return looksLikeParserPlaceholder(value) ? '' : value
}

function isImageArtifact(artifact: ArtifactLike): boolean {
  return Boolean(
    artifact.url?.startsWith('data:image/') ||
    artifact.mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(artifact.name),
  )
}

function sourceLabel(image: VerificationEvidence): string {
  if (image.source === 'backend_capture') return '后台代验'
  if (image.source === 'sandbox_auto') return '沙箱代验'
  if (image.source === 'screen_capture') return '窗口捕获'
  if (image.source === 'tester_upload') return '测试者上传'
  return '历史预览'
}

function makeEvidenceId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片'))
    image.src = url
  })
}

function encodeCanvas(canvas: HTMLCanvasElement): string {
  let quality = 0.9
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > 900_000 && quality > 0.58) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  return dataUrl
}

function renderImageFrame(source: CanvasImageSource, width: number, height: number): string {
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持截图编码')
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight)
  return encodeCanvas(canvas)
}

async function evidenceFromUpload(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请上传 PNG、JPG、WebP 等图片文件')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    return renderImageFrame(image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function captureDisplayFrame(): Promise<string> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前浏览器不支持窗口捕获，请上传实际运行截图')
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('无法读取选中的窗口'))
    })
    await video.play()
    await new Promise(resolve => window.setTimeout(resolve, 120))
    return renderImageFrame(video, video.videoWidth, video.videoHeight)
  } finally {
    stream.getTracks().forEach(track => track.stop())
    video.srcObject = null
  }
}

export function VerificationEvidencePanel({ taskId, model, fallbackEvidenceRaw, onRefresh, onNotice }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [evidence, setEvidence] = useState<VerificationEvidence[]>([])
  const [viewerArtifact, setViewerArtifact] = useState<ArtifactLike | null>(null)
  const [saving, setSaving] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [autoCapturing, setAutoCapturing] = useState(false)

  useEffect(() => {
    setEvidence(parseVerificationEvidence(model.verificationScreenshotUrls || fallbackEvidenceRaw))
  }, [model.id, model.verificationScreenshotUrls, fallbackEvidenceRaw])

  const authenticEvidence = evidence.filter(isAuthenticVerificationEvidence)
  const legacyEvidence = evidence.filter(image => !isAuthenticVerificationEvidence(image))
  const artifacts = Array.isArray(model.artifacts) ? model.artifacts : []

  async function persist(nextEvidence: VerificationEvidence[], successMessage: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.id,
          verificationScreenshotUrls: serializeVerificationEvidence(nextEvidence),
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || '保存验证截图失败')
      setEvidence(nextEvidence)
      onNotice('ok', successMessage)
      onRefresh()
    } catch (error) {
      onNotice('err', errorText(error))
    } finally {
      setSaving(false)
    }
  }

  async function addEvidence(dataUrl: string, source: VerificationEvidence['source'], artifact?: ArtifactLike | null) {
    if (authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE) {
      onNotice('err', `每个模型最多保留 ${MAX_VERIFICATION_EVIDENCE} 张核验证据`)
      return
    }
    const now = new Date()
    const next = [
      ...authenticEvidence,
      {
        id: makeEvidenceId(),
        name: `${source === 'screen_capture' ? '窗口捕获' : source === 'tester_upload' ? '上传截图' : '核验截图'}-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`,
        dataUrl,
        source,
        artifactId: artifact?.id,
        artifactName: artifact?.name,
        capturedAt: now.toISOString(),
      },
    ]
    await persist(next, '核验证据已保存')
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    const remaining = MAX_VERIFICATION_EVIDENCE - authenticEvidence.length
    if (remaining <= 0) {
      onNotice('err', `每个模型最多保留 ${MAX_VERIFICATION_EVIDENCE} 张核验证据`)
      return
    }

    setSaving(true)
    try {
      const additions: VerificationEvidence[] = []
      for (const file of files.slice(0, remaining)) {
        const dataUrl = await evidenceFromUpload(file)
        additions.push({
          id: makeEvidenceId(),
          name: file.name,
          dataUrl,
          source: 'tester_upload',
          capturedAt: new Date().toISOString(),
        })
      }

      const next = [...authenticEvidence, ...additions]
      const res = await fetch(`/api/tasks/${taskId}/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id, verificationScreenshotUrls: serializeVerificationEvidence(next) }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || '保存验证截图失败')
      setEvidence(next)
      onNotice('ok', `已保存 ${additions.length} 张核验证据`)
      onRefresh()
    } catch (error) {
      onNotice('err', errorText(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleCapture(artifact?: ArtifactLike | null) {
    setCapturing(true)
    try {
      const dataUrl = await captureDisplayFrame()
      await addEvidence(dataUrl, 'screen_capture', artifact)
    } catch (error: any) {
      if (error?.name !== 'NotAllowedError') onNotice('err', errorText(error))
    } finally {
      setCapturing(false)
    }
  }

  async function handleBackendCapture(artifact?: ArtifactLike | null) {
    if (authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE) {
      onNotice('err', `每个模型最多保留 ${MAX_VERIFICATION_EVIDENCE} 张核验证据`)
      return
    }
    if (artifacts.length === 0) {
      onNotice('err', '请先上传模型产物，再生成后台代验截图')
      return
    }

    setAutoCapturing(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/models/${model.id}/verification/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: artifact?.id }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || '后台代验截图失败')

      const nextEvidence = parseVerificationEvidence(payload.model?.verificationScreenshotUrls)
      if (nextEvidence.length > 0) setEvidence(nextEvidence)
      onNotice('ok', artifact ? '已生成此产物的后台代验截图' : '后台代验截图已生成')
      onRefresh()
    } catch (error) {
      onNotice('err', errorText(error))
    } finally {
      setAutoCapturing(false)
    }
  }

  async function removeEvidence(id: string) {
    await persist(authenticEvidence.filter(image => image.id !== id), '验证截图已移除')
  }

  async function clearLegacyEvidence() {
    await persist(authenticEvidence, '历史自动预览已清除')
  }

  const viewerText = viewerArtifact ? artifactText(viewerArtifact) : ''
  const isViewerImage = viewerArtifact ? isImageArtifact(viewerArtifact) && viewerArtifact.url?.startsWith('data:image/') : false
  const viewerPreview = viewerArtifact
    ? parseStoredArtifactPreview(viewerArtifact.previewJson) || (
      /\.zip$/i.test(viewerArtifact.name) ? buildLegacyArchivePreview(viewerArtifact.name, viewerText) : null
    )
    : null

  function openArtifactWindow() {
    if (!viewerArtifact) return
    if (isViewerImage && viewerArtifact.url) {
      window.open(viewerArtifact.url, '_blank', 'noopener,noreferrer')
      return
    }
    const content = viewerPreview
      ? buildPreviewFrameDocument(viewerPreview)
      : `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0;padding:40px;font:14px/1.7 "Microsoft YaHei",sans-serif;white-space:pre-wrap;color:#172033}</style></head><body>${viewerText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }))
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <div className="panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Camera className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div>
              <h4 className="text-[13px] font-medium text-white">产物核验证据</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">{authenticEvidence.length} / {MAX_VERIFICATION_EVIDENCE} 张核验证据，至少 1 张</p>
            </div>
          </div>
          <Badge variant={authenticEvidence.length ? 'success' : 'muted'} className="text-[10px]">
            {authenticEvidence.length ? '已具备证据' : '待核验'}
          </Badge>
        </div>

        {artifacts.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] text-gray-500 mb-1.5">核验产物</div>
            <div className="flex flex-wrap gap-1.5">
              {artifacts.map(artifact => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => setViewerArtifact(artifact)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.07] hover:text-white transition-colors"
                  title={`打开 ${artifact.name}`}
                >
                  <Eye className="h-3 w-3 text-cyan-300 flex-shrink-0" />
                  <span className="truncate max-w-40">{artifact.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleBackendCapture(null)}
            loading={autoCapturing}
            loadingText="代验中..."
            disabled={saving || capturing || autoCapturing || artifacts.length === 0 || authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE}
          >
            <Sparkles className="h-3.5 w-3.5" /> 一键后台代验
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCapture(null)}
            loading={capturing}
            loadingText="捕获中..."
            disabled={saving || autoCapturing || authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE}
          >
            <MonitorUp className="h-3.5 w-3.5" /> 捕获实际窗口
          </Button>
          <label className="inline-flex">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={handleFileInput}
              disabled={saving || autoCapturing || authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE}
            />
            <span className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.1]">
              <Upload className="h-3.5 w-3.5" /> 上传截图
            </span>
          </label>
          {saving && <Loader2 className="h-3.5 w-3.5 text-cyan-300 animate-spin" />}
        </div>

        {authenticEvidence.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {authenticEvidence.map(image => (
              <div key={image.id} className="relative aspect-video overflow-hidden rounded-lg border border-white/10 group">
                <button
                  type="button"
                  onClick={() => window.open(image.dataUrl, '_blank', 'noopener,noreferrer')}
                  className="absolute inset-0"
                  title="查看原图"
                >
                  <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1.5 pointer-events-none">
                  <span className="min-w-0 truncate text-[9px] text-gray-200">{sourceLabel(image)}</span>
                  <button
                    type="button"
                    onClick={() => removeEvidence(image.id)}
                    className="pointer-events-auto rounded p-1 text-gray-300 hover:bg-white/10 hover:text-red-300"
                    title="删除截图"
                    disabled={saving}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-5 text-center">
            <FileImage className="mx-auto h-4 w-4 text-gray-600 mb-1.5" />
            <p className="text-[11px] text-gray-500">可一键后台代验，也可上传或捕获实际截图</p>
          </div>
        )}

        {legacyEvidence.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-amber-100">检测到 {legacyEvidence.length} 张历史自动预览，已不计入正式证据；可重新生成后台代验截图。</p>
            </div>
            <button type="button" onClick={clearLegacyEvidence} disabled={saving} className="p-1 text-amber-200 hover:text-white" title="清除历史预览">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {viewerArtifact && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="产物核验视图">
          <div className="panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden border-white/15 bg-[#101116] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-300" />
                  <h3 className="truncate text-sm font-medium text-white">{viewerArtifact.name}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setViewerArtifact(null)} className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" title="关闭核验视图">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[#0c0d11] p-4 scrollbar-thin">
              {isViewerImage ? (
                <img src={viewerArtifact.url || ''} alt={viewerArtifact.name} className="mx-auto max-h-[62vh] max-w-full object-contain" />
              ) : viewerPreview ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-[11px]">
                    <span className="truncate text-cyan-100">主产物：{viewerPreview.primaryName}</span>
                    <span className="text-gray-500">{viewerPreview.renderMode === 'legacy-extract' ? '历史内容提取预览' : '源文件结构化预览'}</span>
                  </div>
                  <iframe
                    sandbox=""
                    srcDoc={buildPreviewFrameDocument(viewerPreview)}
                    title={`${viewerPreview.primaryName} 结构化预览`}
                    className="h-[60vh] w-full rounded-md border border-white/10 bg-white"
                  />
                </div>
              ) : viewerText ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-gray-200">
                  {viewerText.slice(0, MAX_PREVIEW_TEXT_LENGTH)}
                  {viewerText.length > MAX_PREVIEW_TEXT_LENGTH ? '\n\n[内容过长，核验视图仅展示前 60,000 个字符]' : ''}
                </pre>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <FileText className="mb-3 h-7 w-7 text-gray-600" />
                  <p className="text-sm text-gray-300">该产物没有可直接展示的解析内容</p>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">可以先尝试后台代验；如果产物需要真实交互或外部环境，再捕获实际运行窗口作为补充证据。</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
              <span className="text-[11px] text-gray-500">来源：{viewerText || isViewerImage ? '系统内核验视图' : '外部实际运行窗口'}</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleBackendCapture(viewerArtifact)}
                  loading={autoCapturing}
                  loadingText="代验中..."
                  disabled={saving || capturing || autoCapturing || authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE}
                >
                  <Sparkles className="h-3.5 w-3.5" /> 后台代验此产物
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openArtifactWindow}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> 独立窗口打开
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCapture(viewerArtifact)}
                  loading={capturing}
                  loadingText="捕获中..."
                  disabled={saving || autoCapturing || authenticEvidence.length >= MAX_VERIFICATION_EVIDENCE}
                >
                  <Camera className="h-3.5 w-3.5" /> 捕获实际窗口
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
