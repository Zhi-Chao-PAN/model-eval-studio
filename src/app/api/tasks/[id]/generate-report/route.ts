import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import { streamChat } from '@/lib/ai-stream'
import { buildSystemPrompt, buildReportPrompt, buildReportAdjustPrompt } from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'

type VerificationImage = {
  name: string
  dataUrl: string
}

type ScreenshotMeta = {
  images?: VerificationImage[]
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
  const clientVerificationImages: VerificationImage[] = Array.isArray(body.verificationImages)
    ? body.verificationImages.filter(
        (img: any) => typeof img?.name === 'string' && typeof img?.dataUrl === 'string',
      )
    : []

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

        // --- Prepare verification screenshots ---
        let verificationScreenshotUrls = model.verificationScreenshotUrls || null
        let verificationImages: VerificationImage[] = []
        let verificationSummary = ''

        if (adjustInstruction && model.reports.length > 0) {
          // ----- Adjustment path: reuse existing report's screenshots & summary -----
          const current = model.reports[0]
          verificationSummary = current.verificationSummary || ''
          verificationScreenshotUrls = current.verificationScreenshotUrls || verificationScreenshotUrls
          verificationImages = parseVerificationImages(verificationScreenshotUrls)

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
              maxTokens: 3500,
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

          // Use client-provided screenshots (auto-rendered by browser) or reuse existing
          if (clientVerificationImages.length > 0) {
            verificationImages = clientVerificationImages.slice(0, 4)
            verificationScreenshotUrls = JSON.stringify({ images: verificationImages })
            await prisma.taskModel.update({
              where: { id: model.id },
              data: { verificationScreenshotUrls },
            })
          } else {
            verificationImages = parseVerificationImages(model.verificationScreenshotUrls)
          }

          // Phase 1: image analysis
          phase('analyzing_images', {
            modelCode: model.modelCode,
            hasImages: verificationImages.length > 0,
          })
          if (verificationImages.length > 0) {
            try {
              const imgResult = await analyzeImages(
                verificationImages.map((image) => image.dataUrl),
                [
                  '你是模型产物验收员。这些截图是评测系统在核验模型产物时自动截取的（模拟测试人员打开文件/工具查看产物内容），用于证明产物已被实际打开核验。',
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
                },
              )
              verificationSummary = imgResult.content
              if (imgResult.usage) {
                totalTokenInput += imgResult.usage.promptTokens
                totalTokenOutput += imgResult.usage.completionTokens
              }
            } catch (err: any) {
              verificationSummary = '自动生成产物验证截图，但视觉解读失败：' + (err?.message || String(err))
            }
          } else {
            verificationSummary = '未提供产物验证截图（可能因产物为非文本类型或截图生成失败）。'
          }

          // Phase 2: report generation (streaming)
          phase('generating_report', { modelCode: model.modelCode })

          const analysisContext = task.analysisJson
            ? safeJsonParse(task.analysisJson)?.content || ''
            : ''

          const prompt = buildReportPrompt({
            task,
            modelCode: model.modelCode,
            hardMetrics,
            processText: model.processText || '',
            artifactsText: buildArtifactsText(model.artifacts),
            userBackground: aiConfig.background,
            analysisContext,
            verificationSummary,
            hasTrajectory: Boolean(model.processText?.trim()),
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
              maxTokens: 4500,
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
    .map((a) => `文件：${a.name}\n内容：${a.parsedText || a.textContent || '[非文本文件]'}`)
    .join('\n\n')
}

function parseVerificationImages(raw?: string | null): VerificationImage[] {
  if (!raw) return []
  const parsed = safeJsonParse(raw) as ScreenshotMeta | VerificationImage[] | null
  if (Array.isArray(parsed)) return parsed.filter(isVerificationImage)
  if (Array.isArray(parsed?.images)) return parsed.images.filter(isVerificationImage)
  return []
}

function isVerificationImage(v: unknown): v is VerificationImage {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as VerificationImage).name === 'string' &&
    typeof (v as VerificationImage).dataUrl === 'string'
  )
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
