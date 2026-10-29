/**
 * 报告版本管理：版本号分配、生成快照、修订记录
 */

import type { ModelReport, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'
import { clampDbText, clampRequiredText, DB_TEXT_LIMITS } from '@/lib/utils'

export type ReportSource = 'AI_GENERATED' | 'AI_ADJUSTED' | 'MANUAL'

export interface ReportGenerationSnapshot {
  taskTitle: string
  taskDescription?: string | null
  taskBackground?: string | null
  hardMetrics?: unknown | null
  processTextHash?: string
  processTextLength?: number
  artifactAnalysisSignature?: string | null
  artifactCount?: number
  verificationSummary?: string | null
  verificationEvidenceSignature?: string | null
  generatedAt: string
  aiModel?: string
  aiProvider?: string
  tokenInput?: number
  tokenOutput?: number
  durationMs?: number
}

export interface ReportGenerationConfig {
  rubricTemplateType?: string
  rubricDimensionsJson?: string
  rubricOverallFormula?: string | null
  taskType?: string
}

/**
 * Allocate and persist a version atomically. Lock the model row, including when
 * it has no reports yet; all writers share this boundary. AI calls stay outside
 * the short transaction, and unrelated models do not block each other.
 */
export async function createVersionedReport(
  data: Omit<Prisma.ModelReportUncheckedCreateInput, 'version' | 'id'>,
): Promise<ModelReport> {
  return prisma.$transaction(async tx => {
    const models = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "TaskModel" WHERE "id" = ${data.taskModelId} FOR UPDATE
    `
    if (!models.length) throw new Error('模型不存在')
    const latest = await tx.modelReport.aggregate({
      where: { taskModelId: data.taskModelId },
      _max: { version: true },
    })
    return tx.modelReport.create({
      data: { ...data, version: (latest._max.version ?? 0) + 1 },
    })
  })
}

/** 生成文本内容的 SHA-256 哈希（用于快照摘要） */
export function hashContent(content: string | null | undefined): string | undefined {
  if (!content) return undefined
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/** 构建生成依据快照 */
export function buildGenerationSnapshot(opts: {
  task: { title: string; description?: string | null; backgroundUsed?: string | null }
  model: {
    hardMetricsJson?: string | null
    processText?: string | null
    artifactAnalysisJson?: string | null
    verificationScreenshotUrls?: string | null
    verificationSummary?: string | null
  }
  artifactCount?: number
  aiModel?: string
  aiProvider?: string
  tokenInput?: number
  tokenOutput?: number
  durationMs?: number
}): string {
  const snapshot: ReportGenerationSnapshot = {
    taskTitle: opts.task.title,
    taskDescription: opts.task.description,
    taskBackground: opts.task.backgroundUsed,
    hardMetrics: opts.model.hardMetricsJson
      ? safeJsonParse(opts.model.hardMetricsJson)
      : null,
    processTextHash: hashContent(opts.model.processText),
    processTextLength: opts.model.processText?.length || 0,
    artifactAnalysisSignature: extractArtifactSignature(opts.model.artifactAnalysisJson),
    artifactCount: opts.artifactCount,
    verificationSummary: opts.model.verificationSummary,
    verificationEvidenceSignature: hashContent(opts.model.verificationScreenshotUrls),
    generatedAt: new Date().toISOString(),
    aiModel: opts.aiModel,
    aiProvider: opts.aiProvider,
    tokenInput: opts.tokenInput,
    tokenOutput: opts.tokenOutput,
    durationMs: opts.durationMs,
  }
  return JSON.stringify(snapshot)
}

/** 构建生成配置快照 */
export function buildGenerationConfig(opts: {
  rubric?: { templateType: string; dimensionsJson: string; overallFormula?: string | null } | null
  taskType?: string
}): string {
  const config: ReportGenerationConfig = {
    rubricTemplateType: opts.rubric?.templateType,
    rubricDimensionsJson: opts.rubric?.dimensionsJson,
    rubricOverallFormula: opts.rubric?.overallFormula,
    taskType: opts.taskType,
  }
  return JSON.stringify(config)
}

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function extractArtifactSignature(json: string | null | undefined): string | null {
  if (!json) return null
  const parsed = safeJsonParse(json)
  if (parsed && typeof parsed === 'object') {
    const sig = (parsed as Record<string, unknown>).artifactSignature
    if (typeof sig === 'string') return sig
  }
  return null
}

/**
 * 创建报告修订版（基于已有版本创建新版本）。
 * 用于人工修订、AI 调整等场景。
 */
export async function createReportRevision(opts: {
  taskModelId: string
  parentReportId: string
  source: ReportSource
  editedById?: string
  editNote?: string
  productFeedback?: string
  overallScore?: number
  overallComment?: string
  efficiencyScore?: number
  efficiencyComment?: string
  qualityScore?: number
  qualityComment?: string
  trajectoryAnalysis?: string
  verificationScreenshotUrls?: string | null
  verificationSummary?: string | null
  generationSnapshot?: string
  generationConfig?: string
}): Promise<ModelReport> {
  const parent = await prisma.modelReport.findUnique({
    where: { id: opts.parentReportId },
  })
  if (!parent) throw new Error('父报告不存在')
  // 防止跨 model 链接版本链
  if (parent.taskModelId !== opts.taskModelId) {
    throw new Error('父报告与当前模型不匹配')
  }

  return createVersionedReport({
    taskModelId: opts.taskModelId,
    source: opts.source,
    parentReportId: opts.parentReportId,
    editedById: opts.editedById || null,
    editNote: clampDbText(opts.editNote ?? null, 500),
    productFeedback: clampRequiredText(opts.productFeedback ?? parent.productFeedback, DB_TEXT_LIMITS.COMMENT),
    verificationScreenshotUrls:
      opts.verificationScreenshotUrls !== undefined
        ? opts.verificationScreenshotUrls
        : parent.verificationScreenshotUrls,
    verificationSummary: clampDbText(
      opts.verificationSummary !== undefined ? opts.verificationSummary : parent.verificationSummary,
      DB_TEXT_LIMITS.VERIFICATION,
    ),
    overallScore: opts.overallScore ?? parent.overallScore,
    overallComment: clampRequiredText(opts.overallComment ?? parent.overallComment, DB_TEXT_LIMITS.COMMENT),
    efficiencyScore: opts.efficiencyScore ?? parent.efficiencyScore,
    efficiencyComment: clampRequiredText(opts.efficiencyComment ?? parent.efficiencyComment, DB_TEXT_LIMITS.COMMENT),
    qualityScore: opts.qualityScore ?? parent.qualityScore,
    qualityComment: clampRequiredText(opts.qualityComment ?? parent.qualityComment, DB_TEXT_LIMITS.COMMENT),
    trajectoryAnalysis: clampDbText(opts.trajectoryAnalysis ?? parent.trajectoryAnalysis, DB_TEXT_LIMITS.ANALYSIS),
    generationSnapshot: opts.generationSnapshot ?? parent.generationSnapshot,
    generationConfig: opts.generationConfig ?? parent.generationConfig,
  })
}
