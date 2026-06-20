import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import { streamChat } from '@/lib/ai-stream'
import {
  buildSystemPrompt,
  buildReportPrompt,
  buildReportAdjustPrompt,
  buildSingleFileAnalysisPrompt,
  buildFilesSummaryPrompt,
} from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'
import { artifactEntryScore, inferArtifactPreviewKind } from '@/lib/artifact-preview'
import {
  isAuthenticVerificationEvidence,
  parseVerificationEvidence,
  serializeVerificationEvidence,
  type VerificationEvidence,
} from '@/lib/verification-evidence'
import {
  isFreshModelArtifactAnalysis,
  parseStoredModelArtifactAnalysis,
} from '@/lib/model-artifact-analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const FILE_ANALYSIS_LIMIT = 4
const FILE_ANALYSIS_CHAR_LIMIT = 32_000
const AUXILIARY_CALL_TIMEOUT_MS = 45_000
const REPORT_CALL_TIMEOUT_MS = 90_000

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const { id } = await params
  const body = await request.json()
  const modelId = body.modelId
  const adjustInstruction = body.adjustInstruction

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: {
      models: {
        include: {
          artifacts: true,
          reports: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
  if (!task) return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  const model = task.models.find((item) => item.id === modelId)
  if (!model) return new Response(JSON.stringify({ error: '模型不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  const testerEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
    .filter(isAuthenticVerificationEvidence)
  if (!adjustInstruction && testerEvidence.length === 0) {
    return new Response(
      JSON.stringify({ error: '请先完成后台代验，或上传/捕获至少 1 张核验证据后再生成报告。' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先配置 AI API' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const encoder = new TextEncoder()
  let totalTokenInput = 0
  let totalTokenOutput = 0
  let streamError: string | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const startedAtInner = Date.now()
      const phase = (name: string, extra?: Record<string, any>) => {
        send('phase', { name, elapsedMs: Date.now() - startedAtInner, ...extra })
      }

      try {
        send('start', { ts: startedAtInner })

        // Only stored, source-marked evidence is eligible for report analysis.
        let verificationScreenshotUrls = model.verificationScreenshotUrls || null
        let verificationSummary = ''

        if (adjustInstruction && model.reports.length > 0) {
          // ----- Adjustment path: keep only the original report's authentic evidence -----
          const current = model.reports[0]
          const reportEvidence = parseVerificationEvidence(
            current.verificationScreenshotUrls || verificationScreenshotUrls,
          ).filter(isAuthenticVerificationEvidence)
          verificationScreenshotUrls = reportEvidence.length
            ? serializeVerificationEvidence(reportEvidence)
            : null
          verificationSummary = reportEvidence.length
            ? current.verificationSummary || '已提供产物核验证据，但未保留截图解读。'
            : missingEvidenceSummary()

          phase('adjusting_report', { modelCode: model.modelCode })

          const currentText = formatReportText(model.modelCode, current)
          const prompt = buildReportAdjustPrompt({
            currentReport: currentText,
            userInstruction: adjustInstruction,
            modelCode: model.modelCode,
            userBackground: aiConfig.background,
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
              temperature: 0.6,
              maxTokens: aiConfig.maxTokens,
              timeoutMs: REPORT_CALL_TIMEOUT_MS,
            },
          )) {
            if (chunk.type === 'delta') {
              reportText += chunk.content
              send('delta', { text: chunk.content })
            } else if (chunk.type === 'usage') {
              totalTokenInput += chunk.usage.promptTokens
              totalTokenOutput += chunk.usage.completionTokens
            }
          }

          phase('saving')
          const parsed = parseReport(reportText, Boolean(model.processText?.trim()))
          const report = await prisma.modelReport.create({
            data: {
              taskModelId: modelId,
              productFeedback: parsed.productFeedback,
              verificationScreenshotUrls,
              verificationSummary,
              overallScore: parsed.overallScore,
              overallComment: parsed.overallComment,
              efficiencyScore: parsed.efficiencyScore,
              efficiencyComment: parsed.efficiencyComment,
              qualityScore: parsed.qualityScore,
              qualityComment: parsed.qualityComment,
              trajectoryAnalysis: parsed.trajectoryAnalysis,
            },
          })
          await prisma.task.update({ where: { id }, data: { currentStep: 'REPORT' } })
          send('done', { report, rawText: reportText })
        } else {
          // ----- Fresh generation path -----
          const hardMetrics = model.hardMetricsJson ? safeJsonParse(model.hardMetricsJson) : null
          const storedPreAnalysis = parseStoredModelArtifactAnalysis(model.artifactAnalysisJson)
          const preAnalysis = isFreshModelArtifactAnalysis(storedPreAnalysis, model.artifacts)
            ? storedPreAnalysis
            : null

          const storedEvidence = parseVerificationEvidence(model.verificationScreenshotUrls)
          const verificationEvidence = testerEvidence
          verificationScreenshotUrls = verificationEvidence.length
            ? serializeVerificationEvidence(verificationEvidence)
            : null

          // Phase 1: analyze stored, source-marked verification evidence only.
          phase(preAnalysis ? 'reusing_artifact_analysis' : 'analyzing_images', {
            modelCode: model.modelCode,
            hasImages: verificationEvidence.length > 0,
          })
          if (preAnalysis) {
            verificationScreenshotUrls = preAnalysis.verificationScreenshotUrls || verificationScreenshotUrls
            verificationSummary = preAnalysis.verificationSummary
          } else if (verificationEvidence.length > 0) {
            try {
              const imgResult = await analyzeImages(
                verificationEvidence.map((image) => image.dataUrl),
                [
                  '你是模型产物验收员。以下证据可能来自后台代验截图、测试者上传截图或窗口捕获。',
                  '后台代验截图只能证明系统打开并渲染了上传产物的可见内容；测试者上传/窗口捕获只能证明截图中出现的实际核验画面。',
                  '它们可以证明截图中出现的界面、文本、数据或工具结果，但不能证明截图之外的行为。',
                  '截图只能证明画面中实际出现的内容，严禁据此补全截图之外的行为或运行结果。',
                  '不能根据文件名或想象补全运行结果。',
                  `证据来源：${describeEvidenceSources(verificationEvidence)}`,
                  '请仔细阅读截图中的内容（文件名、文本内容、代码、数据等），判断：',
                  '1. 截图显示了什么内容？是否足以证明产物被实际打开和核验？',
                  '2. 从截图中可以看到产物的表面效果如何？是否存在明显错误、缺失、乱码、格式问题？',
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
                totalTokenInput += imgResult.usage.promptTokens
                totalTokenOutput += imgResult.usage.completionTokens
              }
            } catch (err: any) {
              verificationSummary = '已提供产物核验证据，但视觉解读失败：' + (err?.message || String(err))
            }
          } else {
            verificationSummary = missingEvidenceSummary(storedEvidence.length > 0)
          }

          // Phase 1.5: Per-file deep analysis (per-file → summary)
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
            .filter((a) => (a.parsedText?.length || 0) + (a.textContent?.length || 0) > 0)
            .sort((a, b) => {
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
            filesAnalysis = '（未上传可解析的文本产物，基于产物核验证据和硬指标进行评估。）'
          } else {
            const perFileResults = await Promise.all(textArtifacts.map(async (artifact, i) => {
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
                totalTokenInput += fileResult.usage?.promptTokens ?? 0
                totalTokenOutput += fileResult.usage?.completionTokens ?? 0
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
            totalTokenInput += synthesisResult.usage?.promptTokens ?? 0
            totalTokenOutput += synthesisResult.usage?.completionTokens ?? 0
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
              send('delta', { text: chunk.content })
            } else if (chunk.type === 'usage') {
              totalTokenInput += chunk.usage.promptTokens
              totalTokenOutput += chunk.usage.completionTokens
            }
          }

          // Phase 3: save to DB
          phase('saving')
          const parsed = parseReport(reportText, Boolean(model.processText?.trim()))
          const report = await prisma.modelReport.create({
            data: {
              taskModelId: modelId,
              productFeedback: parsed.productFeedback,
              verificationScreenshotUrls,
              verificationSummary,
              overallScore: parsed.overallScore,
              overallComment: parsed.overallComment,
              efficiencyScore: parsed.efficiencyScore,
              efficiencyComment: parsed.efficiencyComment,
              qualityScore: parsed.qualityScore,
              qualityComment: parsed.qualityComment,
              trajectoryAnalysis: parsed.trajectoryAnalysis,
            },
          })
          await prisma.task.update({ where: { id }, data: { currentStep: 'REPORT' } })
          send('done', { report, rawText: reportText })
        }
      } catch (err: any) {
        streamError = err?.message || String(err)
        send('error', { message: streamError })
      } finally {
        controller.close()
        logAudit(request, {
          action: 'AI_REPORT_GENERATE',
          userId: session.userId,
          taskId: id,
          status: streamError ? 'error' : 'success',
          error: streamError,
          tokenInput: totalTokenInput || null,
          tokenOutput: totalTokenOutput || null,
          durationMs: Date.now() - startedAt,
          detail: { modelCode: model.modelCode, adjust: !!adjustInstruction },
        })
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
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
  const captured = evidence.filter(image => image.source === 'screen_capture').length
  const uploaded = evidence.filter(image => image.source === 'tester_upload').length
  const backend = evidence.filter(image => image.source === 'backend_capture').length
  const sandbox = evidence.filter(image => image.source === 'sandbox_auto').length
  const parts: string[] = []
  if (backend) parts.push(`${backend} 张后台代验截图`)
  if (sandbox) parts.push(`${sandbox} 张沙箱代验截图`)
  if (captured) parts.push(`${captured} 张浏览器窗口捕获`)
  if (uploaded) parts.push(`${uploaded} 张测试人员上传截图`)
  return parts.join('，') || '未标记来源'
}

function missingEvidenceSummary(hasLegacyPreview = false): string {
  return hasLegacyPreview
    ? '仅检测到历史自动预览图，未提供可作为证据的产物核验截图。产物效果反馈只能基于上传产物文本和任务要求判断。'
    : '未提供产物核验证据。产物效果反馈只能基于上传产物文本和任务要求判断。'
}

// Keep the old format/parse helpers below for reuse (same as before)

function formatReportText(modelCode: string, report: any): string {
  return `====================================
评估对象：${modelCode}
====================================

【产物效果反馈】
${report.productFeedback || ''}

【模型交付效率是否符合预期？】
评分：${formatHalfScore(report.efficiencyScore)} / 10
评论：${report.efficiencyComment || ''}

【模型的产物质量怎么样】
评分：${formatHalfScore(report.qualityScore)} / 10
评论：${report.qualityComment || ''}

【模型的综合表现怎么样】
评分：${formatIntegerScore(report.overallScore)} / 10
评论：${report.overallComment || ''}

【轨迹分析】
${report.trajectoryAnalysis || '未提供轨迹截图。'}
`
}

function parseReport(text: string, hasTrajectory: boolean) {
  const productFeedback = extractSection(text, '【产物效果反馈】', '【模型交付效率是否符合预期？】')
  const efficiencyScore = normalizeHalfScore(extractScore(text, '【模型交付效率是否符合预期？】'))
  const efficiencyComment = extractComment(text, '【模型交付效率是否符合预期？】', '【模型的产物质量怎么样】')
  const qualityScore = normalizeHalfScore(extractScore(text, '【模型的产物质量怎么样】'))
  const qualityComment = extractComment(text, '【模型的产物质量怎么样】', '【模型的综合表现怎么样】')
  const overallScore = normalizeOverallScore(extractScore(text, '【模型的综合表现怎么样】'))
  const overallComment = extractComment(text, '【模型的综合表现怎么样】', '【轨迹分析】')
  const trajectoryAnalysis = hasTrajectory
    ? extractSectionAfter(text, '【轨迹分析】').trim() || '已提供轨迹截图，但报告未生成有效轨迹分析。'
    : '未提供轨迹截图。'

  return {
    productFeedback: productFeedback.trim(),
    overallScore, overallComment: overallComment.trim(),
    efficiencyScore, efficiencyComment: efficiencyComment.trim(),
    qualityScore, qualityComment: qualityComment.trim(),
    trajectoryAnalysis,
  }
}

function extractSection(text: string, start: string, end: string): string {
  const s = text.indexOf(start); const e = text.indexOf(end)
  if (s === -1 || e === -1 || e <= s) return ''
  return text.slice(s + start.length, e).trim()
}
function extractSectionAfter(text: string, start: string): string {
  const s = text.indexOf(start)
  if (s === -1) return ''
  return text.slice(s + start.length).trim()
}
function extractScore(text: string, marker: string): number {
  const idx = text.indexOf(marker)
  if (idx === -1) return 0
  const m = text.slice(idx, idx + 500).match(/评分[：:\s]*([1-9](?:\.5)?|10(?:\.0)?)/)
  return m ? parseFloat(m[1]) : 0
}
function extractComment(text: string, start: string, end: string): string {
  return cleanComment(extractSection(text, start, end))
}
function cleanComment(s: string): string {
  return s.replace(/评分[：:\s]*([1-9](?:\.5)?|10(?:\.0)?)(?:\s*\/\s*10)?\s*/g, '').replace(/^评论[：:\s]*/m, '').trim()
}
function normalizeOverallScore(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(s)))
}
function normalizeHalfScore(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(s * 2) / 2))
}
function formatIntegerScore(s: number): string { return String(normalizeOverallScore(s)) }
function formatHalfScore(s: number): string {
  const n = normalizeHalfScore(s)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
