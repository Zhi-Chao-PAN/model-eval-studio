import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { analyzeImages, generateChat } from '@/lib/ai'
import { buildSystemPrompt, buildReportPrompt, buildReportAdjustPrompt } from '@/lib/ai-prompts'

type VerificationImage = {
  name: string
  dataUrl: string
}

type ScreenshotMeta = {
  images?: VerificationImage[]
}

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

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
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const model = task.models.find((item) => item.id === modelId)
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return NextResponse.json({ error: '请先配置 AI API' }, { status: 400 })
  }

  let reportText: string
  let verificationSummary = ''
  let verificationScreenshotUrls = model.verificationScreenshotUrls || null

  if (adjustInstruction && model.reports.length > 0) {
    const current = model.reports[0]
    verificationSummary = current.verificationSummary || ''
    verificationScreenshotUrls = current.verificationScreenshotUrls || verificationScreenshotUrls
    const currentText = formatReportText(model.modelCode, current)

    const prompt = buildReportAdjustPrompt({
      currentReport: currentText,
      userInstruction: adjustInstruction,
      modelCode: model.modelCode,
      userBackground: aiConfig.background,
    })

    reportText = await generateChat(
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
    )
  } else {
    const hardMetrics = model.hardMetricsJson ? safeJsonParse(model.hardMetricsJson) : null

    // Use client-provided verification screenshots (auto-rendered by the browser
    // to look like a code editor / document viewer, simulating the tester
    // opening the artifact). Fall back to any previously saved screenshots.
    let verificationImages: VerificationImage[] = []
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

    verificationSummary = await summarizeVerificationImages({
      images: verificationImages,
      taskTitle: task.title,
      taskDescription: task.description || '',
      modelCode: model.modelCode,
      artifactsText: buildArtifactsText(model.artifacts),
      aiConfig,
    })

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

    reportText = await generateChat(
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
    )
  }

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

  await prisma.task.update({
    where: { id },
    data: { currentStep: 'REPORT' },
  })

  return NextResponse.json({ report, rawText: reportText })
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function buildArtifactsText(artifacts: Array<{ name: string; parsedText?: string | null; textContent?: string | null }>): string {
  return artifacts
    .map((artifact) => `文件：${artifact.name}\n内容：${artifact.parsedText || artifact.textContent || '[非文本文件]'}`)
    .join('\n\n')
}

function parseVerificationImages(raw?: string | null): VerificationImage[] {
  if (!raw) return []
  const parsed = safeJsonParse(raw) as ScreenshotMeta | VerificationImage[] | null
  if (Array.isArray(parsed)) return parsed.filter(isVerificationImage)
  if (Array.isArray(parsed?.images)) return parsed.images.filter(isVerificationImage)
  return []
}

function isVerificationImage(value: unknown): value is VerificationImage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as VerificationImage).name === 'string' &&
    typeof (value as VerificationImage).dataUrl === 'string'
  )
}

async function summarizeVerificationImages(opts: {
  images: VerificationImage[]
  taskTitle: string
  taskDescription: string
  modelCode: string
  artifactsText: string
  aiConfig: Awaited<ReturnType<typeof getUserAiConfig>>
}): Promise<string> {
  if (!opts.images.length) return '未提供产物验证截图。'
  if (!opts.aiConfig) return '已自动生成产物验证截图，但缺少 AI 配置，未能自动解读截图。'

  try {
    return await analyzeImages(
      opts.images.map((image) => image.dataUrl),
      [
        '你是模型产物验收员。这些截图是评测系统在核验模型产物时自动截取的（模拟测试人员打开文件/工具查看产物内容），用于证明产物已被实际打开核验。',
        '请仔细阅读截图中的内容（文件名、文本内容、代码、数据等），判断：',
        '1. 截图显示了什么内容？是否足以证明产物被实际打开和核验？',
        '2. 从截图中可以看到产物的表面效果如何？是否存在明显错误、缺失、乱码、格式问题？',
        '3. 结合产物文本内容，给出初步验收结论：产物是否符合任务预期？有哪些亮点或问题？',
        '请输出 1 段中文结论，客观具体，不夸大不回避问题。',
        '',
        `任务：${opts.taskTitle}`,
        `任务 prompt：${opts.taskDescription || '未提供'}`,
        `模型：${opts.modelCode}`,
        `已解析产物文本（供参考）：${opts.artifactsText || '未提供'}`,
      ].join('\n'),
      {
        baseUrl: opts.aiConfig.baseUrl,
        apiKey: opts.aiConfig.apiKey,
        model: opts.aiConfig.model,
        provider: opts.aiConfig.provider,
        temperature: 0.2,
        maxTokens: 1200,
      },
    )
  } catch (error: any) {
    return '已提供产物验证截图，但截图自动解读失败：' + (error?.message || String(error))
  }
}

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
    overallScore,
    overallComment: overallComment.trim(),
    efficiencyScore,
    efficiencyComment: efficiencyComment.trim(),
    qualityScore,
    qualityComment: qualityComment.trim(),
    trajectoryAnalysis,
  }
}

function extractSection(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker)
  if (start === -1 || end === -1 || end <= start) return ''
  return text.slice(start + startMarker.length, end).trim()
}

function extractSectionAfter(text: string, startMarker: string): string {
  const start = text.indexOf(startMarker)
  if (start === -1) return ''
  return text.slice(start + startMarker.length).trim()
}

function extractScore(text: string, afterMarker: string): number {
  const idx = text.indexOf(afterMarker)
  if (idx === -1) return 0
  const after = text.slice(idx, idx + 500)
  const match = after.match(/评分[：:\s]*([1-9](?:\.5)?|10(?:\.0)?)/)
  if (match) return Number.parseFloat(match[1])
  return 0
}

function extractComment(text: string, startMarker: string, endMarker: string): string {
  const section = extractSection(text, startMarker, endMarker)
  return cleanComment(section)
}

function cleanComment(section: string): string {
  return section
    .replace(/评分[：:\s]*([1-9](?:\.5)?|10(?:\.0)?)(?:\s*\/\s*10)?\s*/g, '')
    .replace(/^评论[：:\s]*/m, '')
    .trim()
}

function normalizeOverallScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(score)))
}

function normalizeHalfScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 1
  return Math.min(10, Math.max(1, Math.round(score * 2) / 2))
}

function formatIntegerScore(score: number): string {
  return String(normalizeOverallScore(score))
}

function formatHalfScore(score: number): string {
  const normalized = normalizeHalfScore(score)
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
}
