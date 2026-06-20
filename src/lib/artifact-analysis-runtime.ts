import { prisma } from '@/lib/prisma'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import {
  buildFilesSummaryPrompt,
  buildSingleFileAnalysisPrompt,
  buildSystemPrompt,
} from '@/lib/ai-prompts'
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

export const ARTIFACT_ANALYSIS_RUN_STATUS = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const

export const ARTIFACT_ANALYSIS_EVENT_STATUS = {
  QUEUED: 'QUEUED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  WARNING: 'WARNING',
  FAILED: 'FAILED',
} as const

export type ArtifactAnalysisRunInput = {
  runId: string
  taskId: string
  modelId: string
  userId: string
}

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

const FILE_ANALYSIS_LIMIT = 4
const FILE_ANALYSIS_CHAR_LIMIT = 32_000
const AUXILIARY_CALL_TIMEOUT_MS = 45_000

function trimForDisplay(value: string, limit = 560): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > limit ? compact.slice(0, limit) + '…' : compact
}

export function artifactAnalysisErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return trimForDisplay(
    message
      .replace(/(sk-|Bearer\s+)[A-Za-z0-9_\-.]{8,}/gi, '$1[已隐藏]')
      .replace(/api[_-]?key[=:]\s*[^\s,;]+/gi, 'api_key=[已隐藏]'),
    900,
  ) || '未知错误'
}

function safeJsonParse(text?: string | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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

  if (preview) return artifactEntryScore(preview.primaryName, preview.primaryKind, preview.text || '') + 30
  if (artifact.url?.startsWith('data:image/') || artifact.mimeType?.startsWith('image/')) return 115
  return artifactEntryScore(artifact.name, inferArtifactPreviewKind(artifact.name), artifactText(artifact))
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
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'artifact'
}

function buildArtifactsText(artifacts: ArtifactLike[]): string {
  return artifacts
    .slice(0, FILE_ANALYSIS_LIMIT)
    .map((artifact) => {
      const text = artifactText(artifact) || '[非文本文件]'
      return `文件：${artifact.name}\n内容：${text.slice(0, 12_000)}`
    })
    .join('\n\n')
}

async function getRunContext(input: ArtifactAnalysisRunInput) {
  const model = await prisma.taskModel.findFirst({
    where: {
      id: input.modelId,
      taskId: input.taskId,
      task: { userId: input.userId, status: { not: 'DELETED' } },
    },
    include: {
      task: true,
      artifacts: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!model) throw new Error('模型或任务不存在，或已无权访问')
  return { ...model, artifacts: model.artifacts as ArtifactLike[] }
}

export async function appendArtifactAnalysisEvent(input: {
  runId: string
  phase: string
  status: string
  label: string
  detail?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const run = await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: {
      nextEventSeq: { increment: 1 },
      ...(input.status === ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED ? { currentPhase: input.phase } : {}),
    },
    select: { nextEventSeq: true },
  })

  await prisma.artifactAnalysisEvent.create({
    data: {
      runId: input.runId,
      sequence: run.nextEventSeq,
      phase: input.phase,
      status: input.status,
      label: input.label,
      detail: input.detail ? trimForDisplay(input.detail, 2_000) : null,
      metadata: input.metadata ? (input.metadata as never) : undefined,
    },
  })
}

export async function markArtifactAnalysisRunStarted(input: ArtifactAnalysisRunInput): Promise<void> {
  const run = await prisma.artifactAnalysisRun.findUnique({
    where: { id: input.runId },
    select: { startedAt: true },
  })
  if (!run) throw new Error('分析任务不存在')

  await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: {
      status: ARTIFACT_ANALYSIS_RUN_STATUS.RUNNING,
      startedAt: run.startedAt || new Date(),
      error: null,
    },
  })
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'prepare',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '后台分析任务已启动',
    detail: '分析在服务器端执行；即使离开当前页面，已记录的进度和结果仍会保留。',
  })
}

export async function inspectArtifactInputs(input: ArtifactAnalysisRunInput): Promise<void> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'inspect',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在盘点并拆解产物',
  })

  const context = await getRunContext(input)
  if (context.artifacts.length === 0) throw new Error('没有可分析的产物，请先上传文件或粘贴文本')

  const signature = artifactAnalysisSignature(context.artifacts)
  const names = context.artifacts.map(artifact => artifact.name).slice(0, 6)
  await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: { artifactSignature: signature, artifactCount: context.artifacts.length },
  })
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'inspect',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '产物盘点完成',
    detail: `识别到 ${context.artifacts.length} 个产物，将按内容完整度和可渲染性选择主产物进行核验。`,
    metadata: { artifactCount: context.artifacts.length, artifactNames: names },
  })
}

async function ensureBackendEvidence(input: {
  taskTitle: string
  modelCode: string
  artifacts: ArtifactLike[]
  currentRaw?: string | null
}): Promise<{
  evidence: VerificationEvidence[]
  verificationScreenshotUrls: string | null
  warning?: string
  primaryArtifactName?: string
  renderMode?: string
  runner?: string
}> {
  const existing = parseVerificationEvidence(input.currentRaw).filter(isAuthenticVerificationEvidence)
  const hasAutomaticEvidence = existing.some(image => image.source === 'backend_capture' || image.source === 'sandbox_auto')
  if (hasAutomaticEvidence || existing.length >= MAX_VERIFICATION_EVIDENCE) {
    const latest = existing[existing.length - 1]
    return {
      evidence: existing,
      verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
      primaryArtifactName: latest?.primaryArtifactName || latest?.artifactName,
      renderMode: latest?.renderMode,
      runner: latest?.runner,
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
      primaryArtifactName: capture.primaryName,
      renderMode: capture.renderMode,
      runner: capture.runner,
    }
  } catch (error) {
    return {
      evidence: existing,
      verificationScreenshotUrls: existing.length ? serializeVerificationEvidence(existing) : null,
      warning: artifactAnalysisErrorMessage(error),
    }
  }
}

export async function captureArtifactEvidence(input: ArtifactAnalysisRunInput): Promise<void> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'capture',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在后台打开并渲染主产物',
    detail: '将选择最适合展示的产物内容生成核验证据；不会执行不可信代码。',
  })

  const context = await getRunContext(input)
  const result = await ensureBackendEvidence({
    taskTitle: context.task.title,
    modelCode: context.modelCode,
    artifacts: context.artifacts,
    currentRaw: context.verificationScreenshotUrls,
  })

  await Promise.all([
    prisma.taskModel.update({
      where: { id: context.id },
      data: { verificationScreenshotUrls: result.verificationScreenshotUrls },
    }),
    prisma.artifactAnalysisRun.update({
      where: { id: input.runId },
      data: { verificationScreenshotUrls: result.verificationScreenshotUrls },
    }),
  ])

  if (result.warning) {
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase: 'capture',
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.WARNING,
      label: '后台代验未生成新截图',
      detail: result.warning,
    })
    return
  }

  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'capture',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '产物核验证据已生成',
    detail: `已打开并渲染 ${result.primaryArtifactName || '主产物'}，截图将作为后续报告的核验依据。`,
    metadata: { primaryArtifactName: result.primaryArtifactName, renderMode: result.renderMode, runner: result.runner },
  })
}

export async function analyzeArtifactEvidence(input: ArtifactAnalysisRunInput): Promise<string> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'visual_review',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在解读核验证据',
  })

  const [context, run, aiConfig] = await Promise.all([
    getRunContext(input),
    prisma.artifactAnalysisRun.findUnique({ where: { id: input.runId } }),
    getUserAiConfig(input.userId),
  ])
  if (!run) throw new Error('分析任务不存在')
  if (!aiConfig) throw new Error('请先配置 AI API')

  const evidence = parseVerificationEvidence(run.verificationScreenshotUrls).filter(isAuthenticVerificationEvidence)
  let verificationSummary = ''
  if (evidence.length === 0) {
    verificationSummary = '未生成产物核验证据，后续评估将基于已解析的产物内容和硬指标。'
  } else {
    try {
      const result = await analyzeImages(
        evidence.map(item => item.dataUrl),
        [
          '你是一名模型产物验收人员。请基于截图中实际可见的内容写出核验结论。',
          '后台代验截图仅证明系统打开并渲染了上传产物；不得据此声称执行了不可信代码或验证了截图外的行为。',
          '请说明截图展示了什么、能证明什么、不能证明什么，以及可见的表面效果。输出一段专业中文结论。',
          '',
          `任务：${context.task.title}`,
          `任务 Prompt：${context.task.description || '未提供'}`,
          `模型：${context.modelCode}`,
          `已解析文本（仅供参考）：${buildArtifactsText(context.artifacts) || '未提供'}`,
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
      verificationSummary = result.content
    } catch (error) {
      verificationSummary = `已生成产物核验证据，但视觉解读未完成：${artifactAnalysisErrorMessage(error)}`
    }
  }

  await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: { verificationSummary },
  })
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'visual_review',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '核验证据解读完成',
    detail: trimForDisplay(verificationSummary),
    metadata: { evidenceCount: evidence.length },
  })
  return verificationSummary
}

export async function analyzeArtifactFiles(input: ArtifactAnalysisRunInput): Promise<string> {
  const context = await getRunContext(input)
  const aiConfig = await getUserAiConfig(input.userId)
  if (!aiConfig) throw new Error('请先配置 AI API')

  const candidates = context.artifacts
    .map((artifact) => ({
      artifact,
      text: artifactText(artifact),
      score: artifactEntryScore(artifact.name, inferArtifactPreviewKind(artifact.name), artifactText(artifact)),
    }))
    .filter(item => item.text)
    .sort((a, b) => b.score - a.score)
    .slice(0, FILE_ANALYSIS_LIMIT)

  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'content_review',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在拆解产物内容',
    detail: candidates.length ? `将重点分析 ${candidates.length} 个可解析产物。` : '没有可直接解析的文本产物，将保留核验限制。',
  })

  if (candidates.length === 0) {
    const fallback = '（未上传可解析的文本产物，后续报告将基于产物核验证据和硬指标进行评估。）'
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase: 'content_review',
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.WARNING,
      label: '未发现可解析文本',
      detail: fallback,
    })
    return fallback
  }

  const results = await Promise.all(candidates.map(async (item) => {
    const phase = `file:${item.artifact.id}`
    const content = item.text.length > FILE_ANALYSIS_CHAR_LIMIT
      ? `${item.text.slice(0, FILE_ANALYSIS_CHAR_LIMIT)}\n\n[内容已按预分析时限截取，原文件共 ${item.text.length} 字符]`
      : item.text
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase,
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
      label: `正在分析 ${item.artifact.name}`,
      metadata: { fileName: item.artifact.name, charactersRead: content.length, truncated: content.length < item.text.length },
    })

    try {
      const prompt = buildSingleFileAnalysisPrompt({
        task: context.task,
        fileName: item.artifact.name,
        fileContent: content,
        userBackground: aiConfig.background,
        previousFiles: '',
        taskType: context.task.requirementType || undefined,
      })
      const result = await generateChat(
        [
          { role: 'system', content: buildSystemPrompt(aiConfig.background) },
          { role: 'user', content: prompt },
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
      await appendArtifactAnalysisEvent({
        runId: input.runId,
        phase,
        status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
        label: `${item.artifact.name} 分析完成`,
        detail: trimForDisplay(result.content),
        metadata: { fileName: item.artifact.name, charactersRead: content.length },
      })
      return `【文件：${item.artifact.name}】\n${result.content}`
    } catch (error) {
      const message = artifactAnalysisErrorMessage(error)
      await appendArtifactAnalysisEvent({
        runId: input.runId,
        phase,
        status: ARTIFACT_ANALYSIS_EVENT_STATUS.WARNING,
        label: `${item.artifact.name} 未在时限内完成分析`,
        detail: message,
      })
      return `【文件：${item.artifact.name}】\n单文件分析未完成：${message}`
    }
  }))

  const filesAnalysis = results.join('\n\n---\n\n')
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'content_review',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '产物内容拆解完成',
    detail: `已完成 ${candidates.length} 个可解析产物的分项分析。`,
  })
  return filesAnalysis
}

export async function summarizeArtifactFiles(input: ArtifactAnalysisRunInput, filesAnalysis: string): Promise<string> {
  const context = await getRunContext(input)
  const aiConfig = await getUserAiConfig(input.userId)
  if (!aiConfig) throw new Error('请先配置 AI API')

  const analyzableCount = context.artifacts.filter(artifact => artifactText(artifact)).length
  if (analyzableCount <= 1) return filesAnalysis

  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'synthesis',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在汇总多份产物结论',
  })

  const run = await prisma.artifactAnalysisRun.findUnique({ where: { id: input.runId } })
  const prompt = buildFilesSummaryPrompt({
    task: context.task,
    modelCode: context.modelCode,
    hardMetrics: safeJsonParse(context.hardMetricsJson),
    processText: context.processText || '',
    filesAnalysis,
    userBackground: aiConfig.background,
    verificationSummary: run?.verificationSummary || '',
    hasTrajectory: Boolean(context.processText?.trim()),
    taskType: context.task.requirementType || undefined,
  })

  try {
    const result = await generateChat(
      [
        { role: 'system', content: buildSystemPrompt(aiConfig.background) },
        { role: 'user', content: prompt },
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
    const summary = result.content || filesAnalysis
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase: 'synthesis',
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
      label: '多份产物结论已汇总',
      detail: trimForDisplay(summary),
    })
    return summary
  } catch (error) {
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase: 'synthesis',
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.WARNING,
      label: '汇总未在时限内完成，保留分项结论',
      detail: artifactAnalysisErrorMessage(error),
    })
    return filesAnalysis
  }
}

export async function finalizeArtifactAnalysis(input: ArtifactAnalysisRunInput, filesAnalysis: string): Promise<void> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'finalize',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在保存预分析结果',
  })

  const [context, run] = await Promise.all([
    getRunContext(input),
    prisma.artifactAnalysisRun.findUnique({ where: { id: input.runId } }),
  ])
  if (!run) throw new Error('分析任务不存在')

  const currentSignature = artifactAnalysisSignature(context.artifacts)
  if (run.artifactSignature !== currentSignature) {
    throw new Error('分析过程中产物已变更，为避免混入旧结论，本次分析已停止，请重新开始分析')
  }

  const analysis: StoredModelArtifactAnalysis = {
    version: MODEL_ARTIFACT_ANALYSIS_VERSION,
    modelCode: context.modelCode,
    analyzedAt: new Date().toISOString(),
    artifactSignature: currentSignature,
    artifactCount: context.artifacts.length,
    verificationScreenshotUrls: run.verificationScreenshotUrls,
    verificationSummary: run.verificationSummary || '未生成核验证据解读。',
    filesAnalysis,
  }

  await Promise.all([
    prisma.taskModel.update({
      where: { id: context.id },
      data: {
        verificationScreenshotUrls: run.verificationScreenshotUrls,
        artifactAnalysisJson: JSON.stringify(analysis),
      },
    }),
    prisma.artifactAnalysisRun.update({
      where: { id: input.runId },
      data: {
        status: ARTIFACT_ANALYSIS_RUN_STATUS.COMPLETED,
        currentPhase: 'complete',
        filesAnalysis,
        completedAt: new Date(),
      },
    }),
  ])
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'complete',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '产物预分析已完成',
    detail: '核验证据与分析结论已保存。生成评估报告时会优先复用本次结果。',
  })
}

export async function failArtifactAnalysisRun(input: ArtifactAnalysisRunInput, error: unknown): Promise<void> {
  const message = artifactAnalysisErrorMessage(error)
  await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: {
      status: ARTIFACT_ANALYSIS_RUN_STATUS.FAILED,
      currentPhase: 'failed',
      error: message,
      completedAt: new Date(),
    },
  }).catch(() => undefined)
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'failed',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.FAILED,
    label: '产物预分析未完成',
    detail: message,
  }).catch(() => undefined)
}
