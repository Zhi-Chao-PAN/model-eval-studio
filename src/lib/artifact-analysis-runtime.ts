import { prisma } from '@/lib/prisma'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import {
  buildFilesSummaryPrompt,
  buildSingleFileAnalysisPrompt,
  buildSystemPrompt,
} from '@/lib/ai-prompts'
import {
  artifactEntryScore,
  inferArtifactPreviewKind,
} from '@/lib/artifact-preview'
import {
  isAuthenticVerificationEvidence,
  parseVerificationEvidence,
  serializeVerificationEvidence,
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
    detail: `识别到 ${context.artifacts.length} 个产物，将继续进行解压、解析和内容分析。`,
    metadata: { artifactCount: context.artifacts.length, artifactNames: names },
  })
}

export async function captureArtifactEvidence(input: ArtifactAnalysisRunInput): Promise<void> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'capture',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在读取产物效果截图',
    detail: '仅读取测试人员本地验收后上传的截图，不再由后台生成正式验收截图。',
  })

  const context = await getRunContext(input)
  const evidence = parseVerificationEvidence(context.verificationScreenshotUrls)
    .filter(isAuthenticVerificationEvidence)
  const verificationScreenshotUrls = evidence.length ? serializeVerificationEvidence(evidence) : null

  await prisma.artifactAnalysisRun.update({
    where: { id: input.runId },
    data: { verificationScreenshotUrls },
  })

  if (evidence.length === 0) {
    await appendArtifactAnalysisEvent({
      runId: input.runId,
      phase: 'capture',
      status: ARTIFACT_ANALYSIS_EVENT_STATUS.WARNING,
      label: '尚未上传产物效果截图',
      detail: '官方要求测试人员下载产物到本地并完成验收后上传过程截图；本次预分析会先完成产物解压、解析和内容分析，产物效果反馈需截图补齐。',
    })
    return
  }

  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'capture',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.COMPLETED,
    label: '产物效果截图已读取',
    detail: `已读取 ${evidence.length} 张测试人员上传的本地验收截图，后续会用于产物效果反馈。`,
    metadata: { evidenceCount: evidence.length, evidenceNames: evidence.map(item => item.name).slice(0, 6) },
  })
}

export async function analyzeArtifactEvidence(input: ArtifactAnalysisRunInput): Promise<string> {
  await appendArtifactAnalysisEvent({
    runId: input.runId,
    phase: 'visual_review',
    status: ARTIFACT_ANALYSIS_EVENT_STATUS.STARTED,
    label: '正在解读产物效果截图',
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
    verificationSummary = '未上传产物效果截图。产物效果反馈暂不能生成，其余模块会基于已解析的产物内容、任务要求、硬指标和轨迹进行评估。'
  } else {
    try {
      const result = await analyzeImages(
        evidence.map(item => item.dataUrl),
        [
          '你是一名模型产物验收人员。以下图片是测试人员下载产物到本地、实际打开或运行后上传的产物效果截图/验收过程截图。',
          '请只基于截图中实际可见的内容写出验收结论，不要推断截图之外的行为或运行结果。',
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
      verificationSummary = `已上传产物效果截图，但视觉解读未完成：${artifactAnalysisErrorMessage(error)}`
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
    label: '产物效果截图解读完成',
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
    detail: candidates.length ? `将重点分析 ${candidates.length} 个可解析产物。` : '没有可直接解析的文本产物，将保留截图与产物内容限制。',
  })

  if (candidates.length === 0) {
    const fallback = '（未上传可解析的文本产物，后续报告将基于可用产物效果截图、硬指标和任务信息进行评估。）'
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
    verificationSummary: run.verificationSummary || '未上传产物效果截图，暂无法生成产物效果反馈。',
    filesAnalysis,
  }

  await Promise.all([
    prisma.taskModel.update({
      where: { id: context.id },
      data: {
        ...(run.verificationScreenshotUrls ? { verificationScreenshotUrls: run.verificationScreenshotUrls } : {}),
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
    detail: '产物内容分析结论已保存。生成评估报告时会优先复用本次结果；产物效果反馈仍以测试人员上传的本地验收截图为准。',
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
