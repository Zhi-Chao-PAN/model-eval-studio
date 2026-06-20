import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { captureArtifactScreenshot } from '@/lib/server-artifact-capture'
import {
  artifactEntryScore,
  buildLegacyArchivePreview,
  inferArtifactPreviewKind,
  parseStoredArtifactPreview,
} from '@/lib/artifact-preview'
import {
  isAuthenticVerificationEvidence,
  MAX_VERIFICATION_EVIDENCE,
  parseVerificationEvidence,
  serializeVerificationEvidence,
  validateVerificationEvidence,
  type VerificationEvidence,
} from '@/lib/verification-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type ArtifactLike = {
  id: string
  name: string
  url?: string | null
  mimeType?: string | null
  size?: number | null
  parsedText?: string | null
  textContent?: string | null
  previewJson?: string | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function artifactText(artifact: ArtifactLike): string {
  return (artifact.textContent || artifact.parsedText || '').trim()
}

function artifactScore(artifact: ArtifactLike): number {
  const stored = parseStoredArtifactPreview(artifact.previewJson)
  const legacy = !stored && /\.zip$/i.test(artifact.name)
    ? buildLegacyArchivePreview(artifact.name, artifactText(artifact))
    : null
  const preview = stored || legacy

  if (preview) {
    return artifactEntryScore(preview.primaryName, preview.primaryKind, preview.text || '') + 30
  }

  if (artifact.url?.startsWith('data:image/') || artifact.mimeType?.startsWith('image/')) {
    return 115
  }

  const kind = inferArtifactPreviewKind(artifact.name)
  return artifactEntryScore(artifact.name, kind, artifactText(artifact))
}

function chooseArtifact(artifacts: ArtifactLike[], requestedArtifactId?: string): ArtifactLike | null {
  if (requestedArtifactId) {
    return artifacts.find(artifact => artifact.id === requestedArtifactId) || null
  }

  return [...artifacts].sort((a, b) => artifactScore(b) - artifactScore(a))[0] || null
}

function safeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'artifact'
}

function makeEvidenceId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `backend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  let userId: string | null = null
  let taskId: string | null = null
  let modelCode = ''
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    userId = session.userId

    const { id, modelId } = await params
    taskId = id

    const body = await request.json().catch(() => ({})) as {
      artifactId?: unknown
      requestedArtifactId?: unknown
    }
    const requestedArtifactId = typeof body.artifactId === 'string'
      ? body.artifactId
      : typeof body.requestedArtifactId === 'string'
        ? body.requestedArtifactId
        : undefined

    const model = await prisma.taskModel.findFirst({
      where: {
        id: modelId,
        task: { id, userId: session.userId, status: { not: 'DELETED' } },
      },
      include: {
        task: { select: { title: true } },
        artifacts: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    const artifacts = model.artifacts as ArtifactLike[]
    if (artifacts.length === 0) {
      errorMsg = '请先上传模型产物，再生成后台代验截图'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const artifact = chooseArtifact(artifacts, requestedArtifactId)
    if (!artifact) {
      errorMsg = requestedArtifactId ? '指定产物不存在' : '没有可核验的产物'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const existingEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
      .filter(isAuthenticVerificationEvidence)
    if (existingEvidence.length >= MAX_VERIFICATION_EVIDENCE) {
      errorMsg = `每个模型最多保留 ${MAX_VERIFICATION_EVIDENCE} 张验证截图`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const capture = await captureArtifactScreenshot({
      taskTitle: model.task.title,
      modelCode: model.modelCode,
      artifact,
    })

    const now = new Date()
    const evidence: VerificationEvidence = {
      id: makeEvidenceId(),
      name: `后台代验-${safeName(capture.primaryName || artifact.name)}-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`,
      dataUrl: capture.dataUrl,
      source: 'backend_capture',
      artifactId: artifact.id,
      artifactName: artifact.name,
      capturedAt: now.toISOString(),
      runner: capture.runner,
      runLog: capture.runLog,
      renderMode: capture.renderMode,
      primaryArtifactName: capture.primaryName,
    }

    const nextEvidence = [...existingEvidence, evidence]
    const validationError = validateVerificationEvidence(nextEvidence)
    if (validationError) {
      errorMsg = validationError
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const updated = await prisma.taskModel.update({
      where: { id: model.id },
      data: { verificationScreenshotUrls: serializeVerificationEvidence(nextEvidence) },
      include: {
        artifacts: { orderBy: { createdAt: 'asc' } },
        reports: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    status = 'success'
    return NextResponse.json({
      model: updated,
      evidence,
      capture: {
        artifactKind: capture.artifactKind,
        renderMode: capture.renderMode,
        primaryName: capture.primaryName,
        runner: capture.runner,
      },
    })
  } catch (error) {
    errorMsg = errorMessage(error)
    console.error('Backend verification capture failed:', error)
    return NextResponse.json({ error: '后台代验截图失败：' + errorMsg }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'AI_ARTIFACT_ANALYZE',
      userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelCode, mode: 'backend_capture' },
    })
  }
}
