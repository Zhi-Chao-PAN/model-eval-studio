'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Download,
  FileImage,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  isAuthenticVerificationEvidence,
  MAX_VERIFICATION_EVIDENCE,
  parseVerificationEvidence,
  serializeVerificationEvidence,
  type VerificationEvidence,
} from '@/lib/verification-evidence'
import { cn } from '@/lib/utils'

type ArtifactLike = {
  id: string
  name: string
  url?: string | null
  size?: number | null
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

function makeEvidenceId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片，请换一张清晰截图重试'))
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
  if (!file.type.startsWith('image/')) {
    throw new Error('请上传 PNG、JPG、WebP 等图片截图')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    return renderImageFrame(image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function sourceLabel(image: VerificationEvidence): string {
  if (image.source === 'tester_upload') return '本地验收截图'
  if (image.source === 'screen_capture') return '历史窗口捕获'
  if (image.source === 'backend_capture') return '历史后台截图'
  if (image.source === 'sandbox_auto') return '历史沙箱截图'
  return '历史预览截图'
}

function formatSize(value?: number | null): string {
  if (!value || value <= 0) return ''
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function VerificationEvidencePanel({ taskId, model, fallbackEvidenceRaw, onRefresh, onNotice }: Props) {
  const [optimisticEvidence, setOptimisticEvidence] = useState<{ modelId: string; evidence: VerificationEvidence[] } | null>(null)
  const [saving, setSaving] = useState(false)
  // undefined = 未加载/加载中, null = 已加载但为空, string = 已加载的序列化证据
  const [loadedEvidenceRaw, setLoadedEvidenceRaw] = useState<string | null | undefined>(undefined)

  // 懒加载验证截图：仅在 model.verificationScreenshotUrls 未提供时触发
  // （任务详情 API 已裁剪此字段以减少响应体积）
  useEffect(() => {
    if (model.verificationScreenshotUrls !== undefined) return
    if (loadedEvidenceRaw !== undefined) return
    if (optimisticEvidence?.modelId === model.id) return

    let cancelled = false

    fetch(`/api/tasks/${taskId}/models/${model.id}/verification`)
      .then(async (res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json().catch(() => ({}))
      })
      .then((data) => {
        if (cancelled) return
        const serialized =
          data && typeof data.verificationScreenshotUrls === 'string'
            ? data.verificationScreenshotUrls
            : data && typeof data.verificationScreenshotSerialized === 'string'
              ? data.verificationScreenshotSerialized
              : ''
        if (serialized) {
          setLoadedEvidenceRaw(serialized)
        } else {
          setLoadedEvidenceRaw(null)
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoadedEvidenceRaw(null)
        onNotice('err', '加载产物效果截图失败')
      })

    return () => {
      cancelled = true
    }
  }, [model.id, model.verificationScreenshotUrls, taskId, loadedEvidenceRaw, optimisticEvidence, onNotice])

  // 决定使用哪份证据数据
  const evidenceRaw =
    optimisticEvidence?.modelId === model.id
      ? null // 走 optimistic 分支，不使用原始数据
      : model.verificationScreenshotUrls !== undefined
        ? model.verificationScreenshotUrls
        : loadedEvidenceRaw

  const evidence = optimisticEvidence?.modelId === model.id
    ? optimisticEvidence.evidence
    : parseVerificationEvidence(evidenceRaw || fallbackEvidenceRaw)
  const officialEvidence = evidence.filter(isAuthenticVerificationEvidence)
  const legacyEvidence = evidence.filter(image => !isAuthenticVerificationEvidence(image))
  const artifacts = Array.isArray(model.artifacts) ? model.artifacts : []
  const hasRoom = officialEvidence.length < MAX_VERIFICATION_EVIDENCE

  async function persist(nextEvidence: VerificationEvidence[], successMessage: string) {
    setSaving(true)
    try {
      const serialized = serializeVerificationEvidence(nextEvidence)
      const res = await fetch(`/api/tasks/${taskId}/models/${model.id}/verification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationScreenshotUrls: serialized,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || '保存产物效果截图失败')
      setOptimisticEvidence({ modelId: model.id, evidence: nextEvidence })
      setLoadedEvidenceRaw(nextEvidence.length ? serialized : null)
      onNotice('ok', successMessage)
      onRefresh()
    } catch (error) {
      onNotice('err', errorText(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    const remaining = MAX_VERIFICATION_EVIDENCE - officialEvidence.length
    if (remaining <= 0) {
      onNotice('err', `每个模型最多保存 ${MAX_VERIFICATION_EVIDENCE} 张产物效果截图`)
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

      const next = [...officialEvidence, ...additions]
      const serialized = serializeVerificationEvidence(next)
      const res = await fetch(`/api/tasks/${taskId}/models/${model.id}/verification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationScreenshotUrls: serialized,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || '保存产物效果截图失败')
      setOptimisticEvidence({ modelId: model.id, evidence: next })
      setLoadedEvidenceRaw(serialized)
      onNotice('ok', `已保存 ${additions.length} 张产物效果截图`)
      onRefresh()
    } catch (error) {
      onNotice('err', errorText(error))
    } finally {
      setSaving(false)
    }
  }

  async function removeEvidence(id: string) {
    await persist(officialEvidence.filter(image => image.id !== id), '产物效果截图已移除')
  }

  async function clearLegacyEvidence() {
    await persist(officialEvidence, '历史自动截图已清除')
  }

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
            <Camera className="h-3.5 w-3.5 text-cyan-300" />
          </div>
          <div>
            <h4 className="text-[13px] font-medium text-white">产物效果截图</h4>
            <p className="mt-0.5 text-[10px] text-gray-500">
              {officialEvidence.length} / {MAX_VERIFICATION_EVIDENCE} 张，产物效果反馈至少需要 1 张
            </p>
          </div>
        </div>
        <Badge variant={officialEvidence.length ? 'success' : 'muted'} className="text-[10px]">
          {officialEvidence.length ? '已上传' : '待上传'}
        </Badge>
      </div>

      <div className="mb-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] px-3 py-2.5 text-[11px] leading-5 text-cyan-100/90">
        请先把该模型产物下载到本地并实际打开、运行或查看验收，再上传验收过程截图。
        截图应能体现产物真实效果，不要上传代码片段、文件列表或系统生成预览图。
      </div>

      {artifacts.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] text-gray-500">待验收产物</div>
          <div className="space-y-1.5">
            {artifacts.map(artifact => (
              <div
                key={artifact.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-gray-300">{artifact.name}</div>
                  {formatSize(artifact.size) && <div className="mt-0.5 text-[10px] text-gray-400">{formatSize(artifact.size)}</div>}
                </div>
                <a
                  href={`/api/tasks/${taskId}/models/${model.id}/artifacts/${artifact.id}/download`}
                  download={artifact.name}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] text-gray-200 hover:bg-white/[0.1]"
                >
                  <Download className="h-3 w-3" />
                  下载
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className={cn('inline-flex', (!hasRoom || saving) && 'pointer-events-none opacity-60')}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={handleFileInput}
            disabled={saving || !hasRoom}
          />
          <span className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.1]">
            <Upload className="h-3.5 w-3.5" />
            上传验收截图
          </span>
        </label>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
      </div>

      {officialEvidence.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {officialEvidence.map(image => (
            <div key={image.id} className="group relative aspect-video overflow-hidden rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => window.open(image.dataUrl, '_blank', 'noopener,noreferrer')}
                className="absolute inset-0"
                title="查看原图"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Local data-url acceptance screenshots are previewed directly. */}
                <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1.5">
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
          <FileImage className="mx-auto mb-1.5 h-4 w-4 text-gray-400" />
          <p className="text-[11px] text-gray-500">尚未上传产物效果截图</p>
        </div>
      )}

      {legacyEvidence.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-5 text-amber-100">
              检测到 {legacyEvidence.length} 张历史自动/捕获截图，已不计入官方产物效果截图；请上传本地验收过程截图。
            </p>
          </div>
          <button
            type="button"
            onClick={clearLegacyEvidence}
            disabled={saving}
            className="p-1 text-amber-200 hover:text-white"
            title="清除历史自动截图"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
