import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import {
  buildFilesSummaryPrompt,
  buildSingleFileAnalysisPrompt,
  buildSystemPrompt,
} from '@/lib/ai-prompts'
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
import {
  artifactAnalysisSignature,
  MODEL_ARTIFACT_ANALYSIS_VERSION,
  type StoredModelArtifactAnalysis,
} from '@/lib/model-artifact-analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FILE_ANALYSIS_LIMIT = 4
const FILE_ANALYSIS_CHAR_LIMIT = 32_000
const AUXILIARY_CALL_TIMEOUT_MS = 45_000

type ArtifactLike = {
  id: string
  name: string
  url?: string | null
  mimeType?: string | null
  size?: number | null
  parsedText?: string | null
  textContent?: string | null
  previewJson?: string | null
  createdAt?: Date | string | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeJsonParse(text?: string | null): any {
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

function looksLikeParserPlaceholder(text: string): boolean {
  const value = text.trim()
  return value.startsWith('[无法解析') || value.startsWith('[文件解析失败') || value.startsWith('[图片文件过大')
}

function artifactText(artifact: ArtifactLike): string {
  const value = (artifact.textContent || artifact.parsedText || '').trim()
  return looksLikeParserPlaceholder(value) ? '' : value
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
  if (artifact.url?.startsWith('data:image/') || artifact.mimeType?.startsWith('image/')) return 115
  const kind = inferArtifactPreviewKind(artifact.name)
  return artifactEntryScore(artifact.name, kind, artifactText(artifact))
}

function chooseArtifact(artifacts: ArtifactLike[]): ArtifactLike | null {
  return [...artifacts].sort((a, b) => artifactScore(b) - artifactScore(a))[0] || null
}

function makeEvidenceId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'backend-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

function safeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'artifact'
}

function buildArtifactsText(artifacts: ArtifactLike[]): string {
  return artifacts
    .slice(0, FILE_ANALYSIS_LIMIT)
    .map((artifact) => {
      const text = artifactText(artifact) || '[非文本文件]'
      return '文件：' + artifact.name + '\n内容：' + text.slice(0, 12_000)
    })
    .join('\n\n')
}

async function ensureBackendEvidence(input: {
  taskTitle: string
  modelCode: string
  artifacts: ArtifactLike[]
  currentRaw?: string | null
}): Promise<{ evidence: VerificationEvidence[]; verificationScreenshotUrls: string | null; warning?: string }> {
  const existing = parseVerificationEvidence(input.currentRaw).filter(isAuthenticVerificationEvidence)
  const hasAutomaticEvidence = existing.some(image => image.source === 'backend_capture' || image.source === 'sandbox_auto')
  if (hasAutomaticEvidence || existing.length >= MAX_VERIFICATION_EVIDENCE) {
    return {
      evidence: existing,
      verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
    }
  }

  const artifact = chooseArtifact(input.artifacts)
  if (!artifact) {
    return {
      evidence: existing,
      verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
      warning: '没有可用于后台代验的产物',
    }
  }

  try {
    const capture = await captureArtifactScreenshot({
      taskTitle: input.taskTitle,
      modelCode: input.modelCode,
      artifact,
    })
    const now = new Date()
    const nextEvidence: VerificationEvidence[] = [
      ...existing,
      {
        id: makeEvidenceId(),
        name: '后台代验-' + safeName(capture.primaryName || artifact.name) + '-' + now.toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.jpg',
        dataUrl: capture.dataUrl,
        source: 'backend_capture',
        artifactId: artifact.id,
        artifactName: artifact.name,
        capturedAt: now.toISOString(),
        runner: capture.runner,
        runLog: capture.runLog,
        renderMode: capture.renderMode,
        primaryArtifactName: capture.primaryName,
      },
    ]
    const validationError = validateVerificationEvidence(nextEvidence)
    if (validationError) {
      return {
        evidence: existing,
        verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
        warning: validationError,
      }
    }
    return {
      evidence: nextEvidence,
      verificationScreenshotUrls: serializeVerificationEvidence(nextEvidence),
    }
  } catch (error) {
    return {
      evidence: existing,
      verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
      warning: errorMessage(error),
    }
  }
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

    const task = await prisma.task.findFirst({
      where: { id, userId: session.userId, status: { not: 'DELETED' } },
      include: {
        models: {
          where: { id: modelId },
          include: {
            artifacts: { orderBy: { createdAt: 'asc' } },
            reports: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    })

    if (!task || task.models.length === 0) {
      errorMsg = '模型不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }

    const model = task.models[0]
    modelCode = model.modelCode
    const artifacts = model.artifacts as ArtifactLike[]
    if (artifacts.length === 0) {
      errorMsg = '请先上传模型产物，再开始预分析'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const aiConfig = await getUserAiConfig(session.userId)
    if (!aiConfig) {
      errorMsg = '请先配置 AI API'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const hardMetrics = safeJsonParse(model.hardMetricsJson)
    const evidenceResult = await ensureBackendEvidence({
      taskTitle: task.title,
      modelCode: model.modelCode,
      artifacts,
      currentRaw: model.verificationScreenshotUrls,
    })

    let verificationSummary = ''
    if (evidenceResult.evidence.length > 0) {
      try {
        const imgResult = await analyzeImages(
          evidenceResult.evidence.map(image => image.dataUrl),
          [
            '你是模型产物验收员。以下证据可能来自后台代验截图、测试者上传截图或窗口捕获。',
            '后台代验截图只能证明系统打开并渲染了上传产物的可见内容；测试者上传/窗口捕获只能证明截图中出现的实际核验画面。',
            '截图只能证明画面中实际出现的内容，严禁据此补全截图之外的行为或运行结果。',
            '不能根据文件名或想象补全运行结果。',
            '请输出一段中文核验结论，说明截图里实际展示了什么、能证明什么、不能证明什么、表面效果如何。',
            '',
            '任务：' + task.title,
            '任务 prompt：' + (task.description || '未提供'),
            '模型：' + model.modelCode,
            '已解析产物文本（供参考）：' + (buildArtifactsText(artifacts) || '未提供'),
          ].join('\n'),
          {
            baseUrl: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            provider: aiConfig.provider,
            temperature: 0.2,
            maxTokens: 1200,
            timeoutMs: AUXILIARY_CALL_TIMEOUT_MS,
          },
        )
        verificationSummary = imgResult.content
      } catch (error) {
        verificationSummary = '已提供产物核验证据，但视觉解读失败：' + errorMessage(error)
      }
    } else {
      verificationSummary = evidenceResult.warning
        ? '未生成产物核验证据：' + evidenceResult.warning
        : '未提供产物核验证据。'
    }

    const candidates = artifacts
      .map((artifact) => {
        const text = artifactText(artifact)
        const kind = inferArtifactPreviewKind(artifact.name)
        return { artifact, text, score: artifactEntryScore(artifact.name, kind, text) }
      })
      .filter(item => item.text)
      .sort((a, b) => b.score - a.score)
      .slice(0, FILE_ANALYSIS_LIMIT)

    let filesAnalysis = ''
    if (candidates.length === 0) {
      filesAnalysis = '（未上传可解析的文本产物，后续报告将基于产物核验证据和硬指标进行评估。）'
    } else {
      const perFileResults = await Promise.all(candidates.map(async (item) => {
        const contentToAnalyze = item.text.length > FILE_ANALYSIS_CHAR_LIMIT
          ? item.text.slice(0, FILE_ANALYSIS_CHAR_LIMIT) + '\n\n[内容已按预分析时限截取，原文件共 ' + item.text.length + ' 字符]'
          : item.text

        try {
          const filePrompt = buildSingleFileAnalysisPrompt({
            task,
            fileName: item.artifact.name,
            fileContent: contentToAnalyze,
            userBackground: aiConfig.background,
            previousFiles: '',
            taskType: task.requirementType || undefined,
          })
          const fileResult = await generateChat(
            [
              { role: 'system', content: buildSystemPrompt(aiConfig.background) },
              { role: 'user', content: filePrompt },
            ],
            {
              baseUrl: aiConfig.baseUrl,
              apiKey: aiConfig.apiKey,
              model: aiConfig.model,
              provider: aiConfig.provider,
              temperature: 0.25,
              maxTokens: Math.min(1800, aiConfig.maxTokens || 1800),
              timeoutMs: AUXILIARY_CALL_TIMEOUT_MS,
            },
          )
          return '【文件：' + item.artifact.name + '】\n' + fileResult.content
        } catch (error) {
          return '【文件：' + item.artifact.name + '】\n单文件分析未在时限内完成。错误：' + errorMessage(error)
        }
      }))

      filesAnalysis = perFileResults.join('\n\n---\n\n')
      if (perFileResults.length > 1) {
        try {
          const summaryPrompt = buildFilesSummaryPrompt({
            task,
            modelCode: model.modelCode,
            hardMetrics,
            processText: model.processText || '',
            filesAnalysis,
            userBackground: aiConfig.background,
            verificationSummary,
            hasTrajectory: Boolean(model.processText?.trim()),
            taskType: task.requirementType || undefined,
          })
          const summaryResult = await generateChat(
            [
              { role: 'system', content: buildSystemPrompt(aiConfig.background) },
              { role: 'user', content: summaryPrompt },
            ],
            {
              baseUrl: aiConfig.baseUrl,
              apiKey: aiConfig.apiKey,
              model: aiConfig.model,
              provider: aiConfig.provider,
              temperature: 0.25,
              maxTokens: Math.min(2200, aiConfig.maxTokens || 2200),
              timeoutMs: AUXILIARY_CALL_TIMEOUT_MS,
            },
          )
          filesAnalysis = summaryResult.content || filesAnalysis
        } catch {
          // Keep per-file analysis; report generation can still use it directly.
        }
      }
    }

    const analysis: StoredModelArtifactAnalysis = {
      version: MODEL_ARTIFACT_ANALYSIS_VERSION,
      modelCode: model.modelCode,
      analyzedAt: new Date().toISOString(),
      artifactSignature: artifactAnalysisSignature(artifacts),
      artifactCount: artifacts.length,
      verificationScreenshotUrls: evidenceResult.verificationScreenshotUrls,
      verificationSummary,
      filesAnalysis,
    }

    const updated = await prisma.taskModel.update({
      where: { id: model.id },
      data: {
        verificationScreenshotUrls: evidenceResult.verificationScreenshotUrls,
        artifactAnalysisJson: JSON.stringify(analysis),
      },
      include: {
        artifacts: { orderBy: { createdAt: 'asc' } },
        reports: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    })

    status = 'success'
    return NextResponse.json({ model: updated, analysis })
  } catch (error) {
    errorMsg = errorMessage(error)
    console.error('Artifact pre-analysis failed:', error)
    return NextResponse.json({ error: '产物预分析失败：' + errorMsg }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'AI_ARTIFACT_ANALYZE',
      userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { modelCode, mode: 'artifact_pre_analysis' },
    })
  }
}
