/**
 * 报告版本管理：版本号分配、生成快照、修订记录
 */

import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'

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

/** 为 model 分配下一个报告版本号 */
export async function getNextReportVersion(taskModelId: string): Promise<number> {
  const maxVersion = await prisma.modelReport.aggregate({
    where: { taskModelId },
    _max: { version: true },
  })
  return (maxVersion._max.version || 0) + 1
}

/** Prisma 唯一约束冲突错误码（见 https://www.prisma.io/docs/reference/api-reference/error-reference#p2002） */
export function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === 'P2002'
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
}): Promise<any> {
  const parent = await prisma.modelReport.findUnique({
    where: { id: opts.parentReportId },
  })
  if (!parent) throw new Error('父报告不存在')
  // 防止跨 model 链接版本链
  if (parent.taskModelId !== opts.taskModelId) {
    throw new Error('父报告与当前模型不匹配')
  }

  // 使用事务 + 唯一约束冲突重试（最多 3 次），避免并发写入时 version 重复
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const report = await prisma.$transaction(async tx => {
        const version = await (tx as any).modelReport.aggregate({
          where: { taskModelId: opts.taskModelId },
          _max: { version: true },
        }).then((r: any) => (r._max.version || 0) + 1)

        return (tx as any).modelReport.create({
          data: {
            taskModelId: opts.taskModelId,
            version,
            source: opts.source,
            parentReportId: opts.parentReportId,
            editedById: opts.editedById || null,
            editNote: opts.editNote || null,
            productFeedback: opts.productFeedback ?? parent.productFeedback,
            verificationScreenshotUrls:
              opts.verificationScreenshotUrls !== undefined
                ? opts.verificationScreenshotUrls
                : parent.verificationScreenshotUrls,
            verificationSummary:
              opts.verificationSummary !== undefined
                ? opts.verificationSummary
                : parent.verificationSummary,
            overallScore: opts.overallScore ?? parent.overallScore,
            overallComment: opts.overallComment ?? parent.overallComment,
            efficiencyScore: opts.efficiencyScore ?? parent.efficiencyScore,
            efficiencyComment: opts.efficiencyComment ?? parent.efficiencyComment,
            qualityScore: opts.qualityScore ?? parent.qualityScore,
            qualityComment: opts.qualityComment ?? parent.qualityComment,
            trajectoryAnalysis: opts.trajectoryAnalysis ?? parent.trajectoryAnalysis,
            generationSnapshot: opts.generationSnapshot ?? parent.generationSnapshot,
            generationConfig: opts.generationConfig ?? parent.generationConfig,
          },
        })
      })
      return report
    } catch (err: any) {
      if (!isUniqueConstraintError(err) || attempt === MAX_RETRIES - 1) throw err
      // 等待随机时间再重试，避免再次冲突
      await new Promise(r => setTimeout(r, 20 + Math.random() * 80))
    }
  }
}
