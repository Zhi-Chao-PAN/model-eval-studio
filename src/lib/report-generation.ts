/**
 * 报告生成核心逻辑（非 SSE 版本）。
 *
 * 从 generate-report/route.ts 中提取，供两处使用：
 * 1. API 路由（SSE 流式输出）
 * 2. 服务端静默生成（产物分析完成后自动触发）
 *
 * 通过 onPhase / onDelta 回调解耦输出方式。
 */

import { prisma } from '@/lib/prisma'
import { analyzeImages, generateChat } from '@/lib/ai'
import { streamChat } from '@/lib/ai-stream'
import {
  buildSystemPrompt,
  buildReportPrompt,
  buildSingleFileAnalysisPrompt,
  buildFilesSummaryPrompt,
} from '@/lib/ai-prompts'
import { artifactEntryScore, inferArtifactPreviewKind } from '@/lib/artifact-preview'
import {
  isAuthenticVerificationEvidence,
  parseVerificationEvidence,
  serializeVerificationEvidence,
  verificationEvidenceSignature,
  type VerificationEvidence,
} from '@/lib/verification-evidence'
import {
  isFreshArtifactFileAnalysis,
  parseStoredModelArtifactAnalysis,
} from '@/lib/model-artifact-analysis'
import {
  FILE_ANALYSIS_LIMIT,
  FILE_ANALYSIS_CHAR_LIMIT,
} from '@/lib/model-artifact-analysis'
import {
  ReportParseError,
  parseReportStrict,
  type ParsedModelReport,
  type ReportParseOptions,
} from '@/lib/report-parser'
import {
  getDefaultRubric,
  buildRubricGuidancePrompt,
  parseDimensions,
  type RubricData,
} from '@/lib/rubric-templates'
import {
  getNextReportVersion,
  buildGenerationSnapshot,
  buildGenerationConfig,
} from '@/lib/report-versioning'
import { clampDbText, clampRequiredText, DB_TEXT_LIMITS } from '@/lib/utils'

const AUXILIARY_CALL_TIMEOUT_MS = 45_000
const REPORT_CALL_TIMEOUT_MS = 90_000

export interface ReportGenerationCallbacks {
  onPhase?: (name: string, extra?: Record<string, any>) => void
  onDelta?: (text: string) => void
  onReplace?: (text: string) => void
}

export interface ReportGenerationOptions {
  task: any
  model: any
  aiConfig: {
    baseUrl: string
    apiKey: string
    model: string
    provider: 'OPENAI_COMPAT' | 'ANTHROPIC_COMPAT'
    maxTokens: number
    background: string
  }
  callbacks?: ReportGenerationCallbacks
}

export interface ReportGenerationResult {
  report: any
  reportText: string
  tokenInput: number
  tokenOutput: number
}

/**
 * 静默生成一份报告（fresh path，不带 adjust）。
 * 返回写入 DB 后的 report 对象。
 * 失败时抛出错误，由调用方处理。
 */
export async function generateReportForModel(
  options: ReportGenerationOptions,
): Promise<ReportGenerationResult> {
  const { task, model, aiConfig, callbacks = {} } = options
  const { onPhase = () => {}, onDelta = () => {}, onReplace = () => {} } = callbacks

  const startedAt = Date.now()
  let tokenInput = 0
  let tokenOutput = 0

  const phase = (name: string, extra?: Record<string, any>) => {
    onPhase(name, extra)
  }

  // 加载任务的评分规则（优先自定义，否则按任务类型取默认）
  let rubricGuidance: string | undefined
  try {
    const rubricRecord = await prisma.evaluationRubric.findUnique({
      where: { taskId: task.id },
    })
    if (rubricRecord) {
      const rubric: RubricData = {
        templateType: rubricRecord.templateType as RubricData['templateType'],
        dimensions: parseDimensions(rubricRecord.dimensionsJson),
        overallFormula: rubricRecord.overallFormula || '',
      }
      rubricGuidance = buildRubricGuidancePrompt(rubric)
    } else {
      const defaultRubric = getDefaultRubric(task.category || task.requirementType)
      rubricGuidance = buildRubricGuidancePrompt(defaultRubric)
    }
  } catch {
    // 加载失败时静默回退到旧的 type-based 逻辑
  }

  // Only tester-uploaded local acceptance screenshots are eligible.
  const testerEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
    .filter(isAuthenticVerificationEvidence)
  const verificationScreenshotUrls: string | null = testerEvidence.length
    ? serializeVerificationEvidence(testerEvidence)
    : null
  let verificationSummary = ''

  const hardMetrics = model.hardMetricsJson ? safeJsonParse(model.hardMetricsJson) : null
  const storedPreAnalysis = parseStoredModelArtifactAnalysis(model.artifactAnalysisJson)
  const preAnalysis = isFreshArtifactFileAnalysis(storedPreAnalysis, model.artifacts)
    ? storedPreAnalysis
    : null

  const storedEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
  const verificationEvidence = testerEvidence
  const currentEvidenceSignature = verificationEvidenceSignature(model.verificationScreenshotUrls)
  const canReuseVerificationSummary = Boolean(
    preAnalysis &&
    (preAnalysis.verificationEvidenceSignature || '') === currentEvidenceSignature &&
    verificationEvidence.length > 0,
  )

  // Phase 1: analyze verification evidence (or reuse pre-analysis result)
  phase(preAnalysis ? 'reusing_artifact_analysis' : 'analyzing_images', {
    modelCode: model.modelCode,
    hasImages: verificationEvidence.length > 0,
    reusedScreenshotSummary: canReuseVerificationSummary,
  })

  if (preAnalysis && canReuseVerificationSummary) {
    verificationSummary = preAnalysis.verificationSummary
  } else if (verificationEvidence.length > 0) {
    try {
      const imgResult = await analyzeImages(
        verificationEvidence.map((image) => image.dataUrl),
        [
          '你是模型产物验收员。以下图片是测试人员下载产物到本地、实际打开或运行后上传的产物效果截图/验收过程截图。',
          '这些截图只能证明画面中实际出现的内容；不要推断截图之外的运行行为，也不要根据文件名或想象补全运行结果。',
          '重点判断：截图是否展示了产物被实际打开、运行或查看；产物效果是否满足任务目标；是否存在明显错误、空白、乱码、格式错乱或功能缺失。',
          `证据来源：${describeEvidenceSources(verificationEvidence)}`,
          '请仔细阅读截图中的内容（文件名、文本内容、代码、数据等），判断：',
          '1. 截图显示了什么内容？是否足以证明我已经实际验收产物？',
          '2. 从截图中可以看到产物效果如何？是否存在明显错误、缺失、乱码、格式问题？',
          '3. 结合产物文本内容，给出初步验收结论：产物是否符合任务预期？有哪些亮点或问题？',
          '请输出 1 段中文结论，客观具体，不夸大不回避问题。',
          '',
          `任务：${task.title}`,
          `任务 prompt：${task.description || '未提供'}`,
          `模型：${model.modelCode}`,
          `已解析产物文本（供参考）：${buildArtifactsText(model.artifacts) || '未提供'}`,
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
      if (imgResult.usage) {
        tokenInput += imgResult.usage.promptTokens
        tokenOutput += imgResult.usage.completionTokens
      }
    } catch (err: any) {
      verificationSummary = '已提供产物效果截图，但视觉解读失败：' + (err?.message || String(err))
    }
  } else {
    verificationSummary = missingEvidenceSummary(storedEvidence.length > 0)
  }

  // Phase 1.5: Per-file deep analysis
  const analysisContext = task.analysisJson
    ? safeJsonParse(task.analysisJson)?.content || ''
    : ''

  const processText = model.processText || ''
  let filesAnalysis = ''
  let synthesizedAnalysis = ''

  if (preAnalysis) {
    filesAnalysis = preAnalysis.filesAnalysis
    synthesizedAnalysis = preAnalysis.filesAnalysis
  } else {
    const textArtifacts = model.artifacts
      .filter((a: any) => (a.parsedText?.length || 0) + (a.textContent?.length || 0) > 0)
      .sort((a: any, b: any) => {
        const bText = b.parsedText || b.textContent || ''
        const aText = a.parsedText || a.textContent || ''
        return artifactEntryScore(b.name, inferArtifactPreviewKind(b.name), bText) -
          artifactEntryScore(a.name, inferArtifactPreviewKind(a.name), aText)
      })
      .slice(0, FILE_ANALYSIS_LIMIT)

    phase('analyzing_files', {
      modelCode: model.modelCode,
      totalFiles: textArtifacts.length,
    })

    if (textArtifacts.length === 0) {
      filesAnalysis = '（未上传可解析的文本产物，基于产物效果截图和硬指标进行评估。）'
    } else {
      const perFileResults = await Promise.all(textArtifacts.map(async (artifact: any, i: number) => {
        const fileContent = artifact.parsedText || artifact.textContent || ''
        const fileName = artifact.name

        phase('analyzing_file', {
          modelCode: model.modelCode,
          current: i + 1,
          total: textArtifacts.length,
          fileName,
        })

        const contentToAnalyze = fileContent.length > FILE_ANALYSIS_CHAR_LIMIT
          ? `${fileContent.slice(0, FILE_ANALYSIS_CHAR_LIMIT)}\n\n[内容已按报告时限截取，原文件共 ${fileContent.length} 字符]`
          : fileContent

        const filePrompt = buildSingleFileAnalysisPrompt({
          task,
          fileName,
          fileContent: contentToAnalyze,
          userBackground: aiConfig.background,
          previousFiles: '',
          taskType: task.requirementType || undefined,
        })

        try {
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
              temperature: 0.4,
              maxTokens: Math.min(1800, Math.floor((aiConfig.maxTokens ?? 4000) * 0.45)),
              timeoutMs: AUXILIARY_CALL_TIMEOUT_MS,
            },
          )
          tokenInput += fileResult.usage?.promptTokens ?? 0
          tokenOutput += fileResult.usage?.completionTokens ?? 0
          return `【文件：${fileName}】\n${fileResult.content}`
        } catch (error) {
          return `【文件：${fileName}】\n单文件分析未在时限内完成，最终报告将直接参考已解析内容。错误：${error instanceof Error ? error.message : String(error)}`
        }
      }))

      filesAnalysis = perFileResults.join('\n\n---\n\n')
    }

    // Phase 1.8: Summary across all files + trajectory
    phase('synthesizing', { modelCode: model.modelCode })

    const synthesisPrompt = buildFilesSummaryPrompt({
      task,
      modelCode: model.modelCode,
      hardMetrics,
      processText,
      filesAnalysis,
      userBackground: aiConfig.background,
      verificationSummary,
      hasTrajectory: Boolean(processText?.trim()),
      taskType: task.requirementType || undefined,
    })

    synthesizedAnalysis = filesAnalysis
    try {
      const synthesisResult = await generateChat(
        [
          { role: 'system', content: buildSystemPrompt(aiConfig.background) },
          { role: 'user', content: synthesisPrompt },
        ],
        {
          baseUrl: aiConfig.baseUrl,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          provider: aiConfig.provider,
          temperature: 0.5,
          maxTokens: Math.min(2200, Math.floor((aiConfig.maxTokens ?? 4000) * 0.55)),
          timeoutMs: AUXILIARY_CALL_TIMEOUT_MS,
        },
      )
      tokenInput += synthesisResult.usage?.promptTokens ?? 0
      tokenOutput += synthesisResult.usage?.completionTokens ?? 0
      synthesizedAnalysis = synthesisResult.content
    } catch (error) {
      phase('synthesis_fallback', { reason: error instanceof Error ? error.message : String(error) })
    }
  }

  // Phase 2: report generation (streaming)
  phase('generating_report', { modelCode: model.modelCode })

  const prompt = buildReportPrompt({
    task,
    modelCode: model.modelCode,
    hardMetrics,
    processText,
    artifactsText: synthesizedAnalysis,
    userBackground: aiConfig.background,
    analysisContext,
    verificationSummary,
    hasTrajectory: Boolean(processText?.trim()),
    taskType: task.requirementType || undefined,
    rubricGuidance,
  })

  let reportText = ''
  for await (const chunk of streamChat(
    [
      { role: 'system', content: buildSystemPrompt(aiConfig.background) },
      { role: 'user', content: prompt },
    ],
    {
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      provider: aiConfig.provider,
      temperature: 0.7,
      maxTokens: aiConfig.maxTokens,
      timeoutMs: REPORT_CALL_TIMEOUT_MS,
    },
  )) {
    if (chunk.type === 'delta') {
      reportText += chunk.content
      onDelta(chunk.content)
    } else if (chunk.type === 'usage') {
      tokenInput += chunk.usage.promptTokens
      tokenOutput += chunk.usage.completionTokens
    }
  }

  // Phase 3: validate, repair once if necessary, then save to DB.
  const validated = await parseOrRepairReport({
    reportText,
    modelCode: model.modelCode,
    aiConfig,
    options: {
      hasTrajectory: Boolean(model.processText?.trim()),
      hasVerificationEvidence: Boolean(verificationScreenshotUrls),
    },
    onRepair: (issues) => phase('repairing_report', { issues }),
  })
  reportText = validated.reportText
  tokenInput += validated.usage?.promptTokens ?? 0
  tokenOutput += validated.usage?.completionTokens ?? 0
  if (validated.repaired) onReplace(reportText)

  phase('saving')
  const parsed = validated.parsed

  // 分配版本号
  const version = await getNextReportVersion(model.id)

  // 加载 rubric 用于生成配置快照
  const rubricRecord = await prisma.evaluationRubric.findUnique({
    where: { taskId: task.id },
  }).catch(() => null)

  // 构建生成依据快照
  const generationSnapshot = buildGenerationSnapshot({
    task: {
      title: task.title,
      description: task.description,
      backgroundUsed: task.backgroundUsed,
    },
    model: {
      hardMetricsJson: model.hardMetricsJson,
      processText: model.processText,
      artifactAnalysisJson: model.artifactAnalysisJson,
      verificationScreenshotUrls,
      verificationSummary,
    },
    artifactCount: model.artifacts?.length || 0,
    aiModel: aiConfig.model,
    aiProvider: aiConfig.provider,
    tokenInput,
    tokenOutput,
    durationMs: Date.now() - startedAt,
  })

  // 构建生成配置快照
  const generationConfig = buildGenerationConfig({
    rubric: rubricRecord || null,
    taskType: task.requirementType || task.category,
  })

  const report = await prisma.modelReport.create({
    data: {
      taskModelId: model.id,
      version,
      source: 'AI_GENERATED',
      productFeedback: clampRequiredText(parsed.productFeedback, DB_TEXT_LIMITS.COMMENT),
      verificationScreenshotUrls,
      verificationSummary: clampDbText(verificationSummary, DB_TEXT_LIMITS.VERIFICATION),
      overallScore: parsed.overallScore,
      overallComment: clampRequiredText(parsed.overallComment, DB_TEXT_LIMITS.COMMENT),
      efficiencyScore: parsed.efficiencyScore,
      efficiencyComment: clampRequiredText(parsed.efficiencyComment, DB_TEXT_LIMITS.COMMENT),
      qualityScore: parsed.qualityScore,
      qualityComment: clampRequiredText(parsed.qualityComment, DB_TEXT_LIMITS.COMMENT),
      trajectoryAnalysis: clampDbText(parsed.trajectoryAnalysis, DB_TEXT_LIMITS.ANALYSIS),
      generationSnapshot,
      generationConfig,
    },
  })
  await prisma.task.update({ where: { id: task.id }, data: { currentStep: 'REPORT' } })

  // 状态机：所有模型都生成了报告 → COMPLETED
  if (task.status !== 'COMPLETED') {
    const allModels = await prisma.taskModel.count({ where: { taskId: task.id } })
    const modelsWithReports = await prisma.taskModel.count({
      where: { taskId: task.id, reports: { some: {} } },
    })
    if (allModels > 0 && allModels === modelsWithReports) {
      await prisma.task.update({ where: { id: task.id }, data: { status: 'COMPLETED' } })
    }
  }

  return { report, reportText, tokenInput, tokenOutput }
}

// ---- helpers ----

function safeJsonParse(text: string): any {
  try { return JSON.parse(text) } catch { return null }
}

function buildArtifactsText(artifacts: Array<{ name: string; parsedText?: string | null; textContent?: string | null }>): string {
  return artifacts
    .slice(0, FILE_ANALYSIS_LIMIT)
    .map((a) => {
      const text = a.parsedText || a.textContent || '[非文本文件]'
      return `文件：${a.name}\n内容：${text.slice(0, 12_000)}`
    })
    .join('\n\n')
}

function describeEvidenceSources(evidence: VerificationEvidence[]): string {
  const uploaded = evidence.filter(image => image.source === 'tester_upload').length
  return uploaded ? `${uploaded} 张测试人员本地验收截图` : '未上传产物效果截图'
}

function missingEvidenceSummary(hasLegacyPreview = false): string {
  return hasLegacyPreview
    ? '仅检测到历史自动预览图，未提供测试人员本地验收后的产物效果截图。产物效果反馈暂不能生成，其余模块可基于产物内容、任务要求、硬指标和轨迹进行评估。'
    : '未提供产物效果截图。产物效果反馈暂不能生成，其余模块可基于产物内容、任务要求、硬指标和轨迹进行评估。'
}

type RepairAiConfig = {
  baseUrl: string
  apiKey: string
  model: string
  provider: 'OPENAI_COMPAT' | 'ANTHROPIC_COMPAT'
  maxTokens: number
  background: string
}

async function parseOrRepairReport(input: {
  reportText: string
  modelCode: string
  aiConfig: RepairAiConfig
  options: ReportParseOptions
  onRepair: (issues: string[]) => void
}): Promise<{
  parsed: ParsedModelReport
  reportText: string
  repaired: boolean
  usage?: { promptTokens: number; completionTokens: number }
}> {
  try {
    return {
      parsed: parseReportStrict(input.reportText, input.options),
      reportText: input.reportText,
      repaired: false,
    }
  } catch (error) {
    if (!(error instanceof ReportParseError)) throw error
    input.onRepair(error.issues)

    const repairPrompt = buildReportRepairPrompt({
      reportText: input.reportText,
      modelCode: input.modelCode,
      issues: error.issues,
      ...input.options,
    })
    const repaired = await generateChat(
      [
        { role: 'system', content: buildSystemPrompt(input.aiConfig.background) },
        { role: 'user', content: repairPrompt },
      ],
      {
        baseUrl: input.aiConfig.baseUrl,
        apiKey: input.aiConfig.apiKey,
        model: input.aiConfig.model,
        provider: input.aiConfig.provider,
        temperature: 0.1,
        maxTokens: Math.min(2400, input.aiConfig.maxTokens),
        timeoutMs: REPORT_CALL_TIMEOUT_MS,
      },
    )

    try {
      return {
        parsed: parseReportStrict(repaired.content, input.options),
        reportText: repaired.content,
        repaired: true,
        usage: repaired.usage || undefined,
      }
    } catch (repairError) {
      if (repairError instanceof ReportParseError) {
        throw new ReportParseError([
          ...error.issues,
          ...repairError.issues.map(issue => `自动修复后仍存在：${issue}`),
        ])
      }
      throw repairError
    }
  }
}

function buildReportRepairPrompt(input: {
  reportText: string
  modelCode: string
  issues: string[]
  hasTrajectory: boolean
  hasVerificationEvidence: boolean
}): string {
  const productInstruction = input.hasVerificationEvidence
    ? '保留并修正基于产物效果截图的第一人称反馈，不得写成未上传截图。'
    : '产物效果反馈必须且只能写：未上传产物效果截图，暂无法填写产物效果反馈。'
  const trajectoryInstruction = input.hasTrajectory
    ? '轨迹分析必须基于已有轨迹内容给出具体分析。'
    : '轨迹分析必须且只能写：未提供轨迹截图。'

  return `下面这份模型评估报告结构不合格，请只修复格式和明确指出的问题，不要扩写没有证据的事实。

模型：${input.modelCode}
发现的问题：
${input.issues.map(issue => `- ${issue}`).join('\n')}

硬性规则：
- 必须按顺序保留 5 个模块：产物效果反馈、交付效率、产物质量、综合评价、轨迹分析。
- 交付效率和产物质量评分只能是 1-10 的整数或 .5 分。
- 综合评分只能是 1-10 的整数。
- 每个评分模块都必须包含非空评论。
- ${productInstruction}
- ${trajectoryInstruction}
- 全部使用第一人称“我”的测试者口吻，不要使用“用户”“测试者”“测试人员”等任何第三人称称呼，也不要写“建议用户…”“提交到平台后请填写…”“你需要…”之类面向读者的话。
- 不要改变已有评分、是否含产物效果截图、是否含轨迹的约束。
- 只输出修复后的完整报告正文，不要解释修复过程，不要输出任何额外说明。

原报告：
${input.reportText}

请直接输出修复后的完整报告，不要加解释。`
}
