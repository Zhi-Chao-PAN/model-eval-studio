import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { captureArtifactScreenshot } from '@/lib/server-artifact-capture'
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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isImageArtifact(artifact: ArtifactLike): boolean {
  return Boolean(
    artifact.url?.startsWith('data:image/') ||
    artifact.mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(artifact.name),
  )
}

function artifactText(artifact: ArtifactLike): string {
  return (artifact.textContent || artifact.parsedText || '').trim()
}

function artifactScore(artifact: ArtifactLike): number {
  const text = artifactText(artifact)
  if (isImageArtifact(artifact) && artifact.url?.startsWith('data:image/')) return 90
  if (/\.(html?|xhtml)$/i.test(artifact.name) || artifact.mimeType?.includes('html')) return text ? 80 : 20
  if (text) return 70
  return 10
}

function chooseArtifact(artifacts: ArtifactLike[]): ArtifactLike | null {
  return [...artifacts].sort((a, b) => artifactScore(b) - artifactScore(a))[0] || null
}

function makeEvidenceId(): string {
  return `backend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'artifact'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  let userId: string | null = null
  let taskId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let modelCode = ''
  let artifactName = ''

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    userId = session.userId

    const { id, modelId } = await params
    taskId = id
    const body = await request.json().catch(() => ({}))
    const requestedArtifactId = typeof body.artifactId === 'string' ? body.artifactId : ''

    const model = await prisma.taskModel.findFirst({
      where: {
        id: modelId,
        task: { id, userId: session.userId, status: { not: 'DELETED' } },
      },
      include: {
        task: true,
        artifacts: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!model) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    modelCode = model.modelCode

    if (model.artifacts.length === 0) {
      errorMsg = '该模型还没有上传产物，无法后台截图'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const existingEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
      .filter(isAuthenticVerificationEvidence)

    if (existingEvidence.length >= MAX_VERIFICATION_EVIDENCE) {
      errorMsg = `每个模型最多保留 ${MAX_VERIFICATION_EVIDENCE} 张真实核验证据`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const artifact = requestedArtifactId
      ? model.artifacts.find(item => item.id === requestedArtifactId)
      : chooseArtifact(model.artifacts)

    if (!artifact) {
      errorMsg = requestedArtifactId ? '指定产物不存在' : '未找到可截图的产物'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    artifactName = artifact.name

    const capture = await captureArtifactScreenshot({
      taskTitle: model.task.title,
      modelCode: model.modelCode,
      artifact,
    })

    const capturedAt = new Date()
    const evidence: VerificationEvidence = {
      id: makeEvidenceId(),
      name: `后台自动截图-${safeName(artifact.name)}-${capturedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`,
      dataUrl: capture.dataUrl,
      source: 'backend_capture',
      artifactId: artifact.id,
      artifactName: artifact.name,
      capturedAt: capturedAt.toISOString(),
      runner: capture.runner,
      runLog: capture.runLog,
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
      ok: true,
      evidence,
      capture: {
        artifactKind: capture.artifactKind,
        runner: capture.runner,
      },
      model: updated,
    })
  } catch (error: unknown) {
    errorMsg = errorMessage(error)
    console.error('Auto verification capture failed:', error)
    return NextResponse.json({ error: `后台自动截图失败：${errorMsg}` }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'AI_ARTIFACT_ANALYZE',
      userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelCode, artifactName, mode: 'backend_capture' },
    })
  }
}
