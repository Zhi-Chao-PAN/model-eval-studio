// Streaming SSE endpoint for screenshot analysis
// - Node.js runtime (Prisma needs TCP for Neon)
// - AI call streamed via SSE, DB persist happens at end
// - Returns 200 immediately on first byte so client gets fast feedback
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { buildScreenshotAnalysisPrompt, buildDashboardAnalysisPrompt } from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-error'
import { storeArtifactFile, deleteArtifactFile } from '@/lib/artifact-storage'
import {
  parseTrajectoryScreenshots,
  serializeTrajectoryScreenshots,
  filterScreenshotsByType,
  type TrajectoryScreenshot,
  type TrajectoryScreenshotType,
} from '@/lib/trajectory-screenshots'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const MAX_ANALYSIS_IMAGES = 12
const MAX_SINGLE_IMAGE_DATA_URL_LENGTH = 1_200_000
const MAX_TOTAL_IMAGE_DATA_URL_LENGTH = 4_000_000
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDashboardTable(parsed: unknown): unknown {
  if (!isRecord(parsed) || !Array.isArray(parsed.models)) return parsed

  for (const model of parsed.models) {
    if (!isRecord(model) || !isRecord(model.metrics)) continue

    const metrics = model.metrics
    const extraOutputKey = Object.keys(metrics).find((key) => /^Output_\d+$/i.test(key))
    if (extraOutputKey && metrics.Output !== undefined) {
      const likelyInputTotal = metrics.Output
      metrics.Output = metrics[extraOutputKey]
      delete metrics[extraOutputKey]
      if (metrics['Input Total'] === undefined || metrics['Input Total'] === '' || metrics['Input Total'] === '0') {
        metrics['Input Total'] = likelyInputTotal
      }
    }
  }

  return parsed
}

function validateAnalysisImages(images: string[]): string | null {
  if (images.length === 0) return '请至少上传 1 张图片'
  if (images.length > MAX_ANALYSIS_IMAGES) return `一次最多分析 ${MAX_ANALYSIS_IMAGES} 张图片（含自动裁剪图）`

  let totalLength = 0
  for (const image of images) {
    if (!IMAGE_DATA_URL_PATTERN.test(image)) return '仅支持 PNG、JPG、WebP 图片'
    if (image.length > MAX_SINGLE_IMAGE_DATA_URL_LENGTH) return '单张图片过大，请压缩或裁剪后重试'
    totalLength += image.length
  }
  if (totalLength > MAX_TOTAL_IMAGE_DATA_URL_LENGTH) return '图片总数据量过大，请减少图片数量或裁剪后重试'
  return null
}

async function upstreamErrorMessage(response: Response): Promise<string> {
  const hint = response.status === 401
    ? 'API Key 无效'
    : response.status === 404
      ? 'Base URL 或模型名称错误'
      : response.status === 429
        ? '触发限流，请稍后重试'
        : response.status >= 500
          ? '视觉模型服务端异常，请稍后重试'
          : '视觉模型调用失败'
  const raw = (await response.text().catch(() => '')).trim()
  if (!raw || /^<!doctype html/i.test(raw) || /^<html/i.test(raw)) {
    return `${hint}（HTTP ${response.status}，上游返回了网页错误）`
  }

  let detail = raw
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const nested = isRecord(parsed.error) ? parsed.error.message : null
    detail = String(nested || parsed.message || parsed.error || raw)
  } catch {
    detail = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  }
  return `${hint}（HTTP ${response.status}）：${detail.slice(0, 300)}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return apiError('未登录', 401)
  }
  const { id } = await params

  const rateLimit = await consumeRateLimit({
    scope: 'ai-screenshot',
    identifier: session.userId,
    limit: 8,
    windowMs: 10 * 60_000,
  })
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

  let tokenInput: number | null = null
  let tokenOutput: number | null = null
  let auditStatus: 'success' | 'error' = 'error'
  let auditError: string | null = null

  let images: string[] = []
  let type: 'process' | 'dashboard' = 'process'
  try {
    const body: unknown = await request.json()
    if (!isRecord(body) || !Array.isArray(body.images) || !body.images.every(image => typeof image === 'string')) {
      return apiError('图片数据格式错误', 400, 'invalid_image_data')
    }
    if (body.type !== 'process' && body.type !== 'dashboard') {
      return apiError('截图类型无效', 400, 'invalid_screenshot_type')
    }
    images = body.images
    type = body.type
  } catch {
    return apiError('请求体格式错误', 400, 'invalid_body')
  }

  const imageValidationError = validateAnalysisImages(images)
  if (imageValidationError) {
    return apiError(imageValidationError, 400, 'invalid_images')
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: { models: true },
  })
  if (!task) {
    return apiError('任务不存在', 404)
  }

  const userId = session.userId

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return apiError('请先在设置中配置 AI 模型', 400)
  }

  if (aiConfig.provider !== 'OPENAI_COMPAT') {
    return apiError('截图识别需要 OpenAI 兼容接口', 400, 'provider_not_supported')
  }

  const basePrompt = type === 'dashboard' ? buildDashboardAnalysisPrompt() : buildScreenshotAnalysisPrompt()
  const prompt = [
    'You are a strict OCR-to-JSON engine for model evaluation screenshots.',
    'Return only one valid JSON object. Do not output markdown, comments, explanations, or thinking tags.',
    'If the screenshot is a table, read every visible header and row exactly as shown.',
    'Inputs may include the full screenshot plus overlapping crops of the same table; merge them into one table, do not duplicate rows.',
    'Keep model names/codes exactly as visible, preserving case where possible.',
    basePrompt,
  ].join('\n\n')

  // Build multimodal messages
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  for (const url of images) {
    userContent.push({ type: 'image_url', image_url: { url, detail: 'high' } })
  }

  const baseUrl = aiConfig.baseUrl.replace(/\/$/, '')

  const encoder = new TextEncoder()
  let fullText = ''
  let finishReason = ''

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        send('start', { ts: Date.now() })

        const fullUrl = baseUrl.endsWith('/v1') ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
        const requestBody: Record<string, unknown> = {
          model: aiConfig.model,
          messages: [{ role: 'user', content: userContent }],
          max_tokens: aiConfig.maxTokens,
          max_completion_tokens: aiConfig.maxTokens,
          temperature: 0.1,
          stream: true,
        }

        if (/minimax[-_ ]?m3/i.test(aiConfig.model)) {
          requestBody.thinking = { type: 'disabled' }
        }

        const res = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + aiConfig.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: request.signal,
        })

        if (!res.ok || !res.body) {
          auditError = await upstreamErrorMessage(res)
          send('error', { status: res.status, message: auditError })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() || ''
          for (const ev of events) {
            let eventName = 'message'
            let dataLine = ''
            for (const line of ev.split('\n')) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
            }
            if (!dataLine || dataLine === '[DONE]') continue
            try {
              const payload = JSON.parse(dataLine)
              if (payload.choices?.[0]?.finish_reason) {
                finishReason = payload.choices[0].finish_reason
              }
              const delta = payload.choices?.[0]?.delta?.content
                ?? payload.choices?.[0]?.message?.content
                ?? payload.delta?.text
              if (delta) {
                fullText += delta
                send('delta', { text: delta })
              }
              // Capture token usage from final chunk
              if (payload.usage) {
                tokenInput = payload.usage.prompt_tokens ?? null
                tokenOutput = payload.usage.completion_tokens ?? null
              }
            } catch {}
          }
        }

        // Persist to DB
        const clean = fullText
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/<think>[\s\S]*$/g, '')
          .replace(/```json\s*/g, '')
          .replace(/```/g, '')
          .trim()

        let parsed: any = null
        try { parsed = JSON.parse(clean) } catch {
          try {
            const m = clean.match(/\{[\s\S]*\}/)
            if (m) parsed = JSON.parse(m[0])
          } catch {}
        }
        parsed = normalizeDashboardTable(parsed)

        if (!Array.isArray(parsed?.models)) {
          const reason = finishReason === 'length'
            ? '视觉模型输出达到长度上限，尚未生成最终 JSON。请重试，或上传裁剪后更清晰的截图。'
            : '视觉模型没有返回可识别的 JSON。请重试，或上传裁剪后更清晰的截图。'
          auditError = reason
          send('error', { message: reason })
          return
        }

        const inserted: string[] = []
        const updated: string[] = []
        let storedScreenshots: TrajectoryScreenshot[] = []
        try {
          const existingCodes = new Set(
            task.models.map((tm: any) => tm.modelCode.toUpperCase()),
          )

          // 先把本次的 base64 截图全部存到 Blob
          storedScreenshots = await storeScreenshotsToBlob({
            images,
            type,
            userId,
            taskId: id,
          })

          const ops: any[] = []

          for (const m of parsed.models) {
            const modelCode = String(m.modelCode || '').trim().toUpperCase()
            if (!modelCode) continue

            if (type === 'dashboard') {
              const metricsJson = JSON.stringify(m.metrics || m)
              // 合并：保留另一类（process）的截图，替换本类（dashboard）的截图
              const existingModel = task.models.find((tm: any) => tm.modelCode.toUpperCase() === modelCode)
              const existingScreenshots = parseTrajectoryScreenshots(existingModel?.screenshotUrls)
              const otherType = filterScreenshotsByType(existingScreenshots, 'process')
              const mergedScreenshots = [...otherType, ...storedScreenshots]
              const screenshotUrls = serializeTrajectoryScreenshots(mergedScreenshots)
              ops.push(
                prisma.taskModel.upsert({
                  where: { taskId_modelCode: { taskId: id, modelCode } },
                  update: { hardMetricsJson: metricsJson, screenshotUrls },
                  create: {
                    taskId: id,
                    modelCode,
                    displayName: m.displayName || modelCode,
                    hardMetricsJson: metricsJson,
                    screenshotUrls: serializeTrajectoryScreenshots(storedScreenshots),
                  },
                }),
              )
            } else {
              const processText = m.processDetail || m.processSummary
              // 合并：保留另一类（dashboard）的截图，替换本类（process）的截图
              const existingModel = task.models.find((tm: any) => tm.modelCode.toUpperCase() === modelCode)
              const existingScreenshots = parseTrajectoryScreenshots(existingModel?.screenshotUrls)
              const otherType = filterScreenshotsByType(existingScreenshots, 'dashboard')
              const mergedScreenshots = [...otherType, ...storedScreenshots]
              const screenshotUrls = serializeTrajectoryScreenshots(mergedScreenshots)
              const updateData: any = { screenshotUrls }
              if (processText) updateData.processText = processText
              ops.push(
                prisma.taskModel.upsert({
                  where: { taskId_modelCode: { taskId: id, modelCode } },
                  update: updateData,
                  create: {
                    taskId: id,
                    modelCode,
                    displayName: m.displayName || modelCode,
                    processText: processText || null,
                    screenshotUrls: serializeTrajectoryScreenshots(storedScreenshots),
                  },
                }),
              )
            }
          }

          ops.push(
            prisma.task.update({ where: { id }, data: { currentStep: 'SCREENSHOT' } }),
          )

          await prisma.$transaction(ops)

          // 根据预加载的数据统计 inserted / updated
          for (const m of parsed.models) {
            const modelCode = String(m.modelCode || '').trim().toUpperCase()
            if (!modelCode) continue
            if (existingCodes.has(modelCode)) {
              updated.push(modelCode)
            } else {
              inserted.push(modelCode)
            }
          }
        } catch (dbErr: any) {
          auditError = '数据库写入失败：' + (dbErr?.message || String(dbErr))
          send('error', { message: auditError })
          return
        }

        auditStatus = 'success'
        send('done', { inserted, updated, parsed, raw: clean })
      } catch (e: any) {
        auditError = e?.name === 'AbortError'
          ? '截图分析已取消'
          : e?.message || String(e)
        send('error', { message: auditError })
      } finally {
        try { controller.close() } catch {}
        logAudit(request, {
          action: 'AI_SCREENSHOT_ANALYZE',
          userId: session.userId,
          taskId: id,
          status: auditStatus,
          error: auditError,
          tokenInput,
          tokenOutput,
          durationMs: Date.now() - startedAt,
          detail: { imageCount: images.length, type },
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

// --- helpers ---

interface StoreScreenshotsOptions {
  images: string[]          // base64 data URL 数组
  type: TrajectoryScreenshotType
  userId: string
  taskId: string
}

/**
 * 将 base64 截图存入 Blob 存储，返回元数据数组。
 * 失败时清理已上传的文件，然后抛出错误。
 */
async function storeScreenshotsToBlob(
  options: StoreScreenshotsOptions,
): Promise<TrajectoryScreenshot[]> {
  const { images, type, userId, taskId } = options
  const uploaded: { url: string; index: number }[] = []

  try {
    const now = new Date().toISOString()
    const result: TrajectoryScreenshot[] = []

    for (let i = 0; i < images.length; i += 1) {
      const dataUrl = images[i]
      // 从 data URL 提取 mime 和 base64 数据
      const mimeMatch = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,/i)
      const contentType = mimeMatch?.[1] || 'image/jpeg'
      const base64Data = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const buffer = Buffer.from(base64Data, 'base64')
      const ext = contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg'
      const fileName = `screenshot-${i + 1}.${ext}`

      // 路径：model-eval-screenshots/{userId}/{taskId}/{type}/{uuid}-{filename}
      const stored = await storeArtifactFile({
        buffer,
        fileName,
        contentType,
        userId,
        taskId,
        modelId: '__trajectory__', // 截图暂时不按 model 分目录（一次分析可能涉及多个 model）
      })

      uploaded.push({ url: stored.url, index: i })
      result.push({
        id: crypto.randomUUID(),
        name: fileName,
        url: stored.url,
        size: buffer.length,
        type,
        uploadedAt: now,
      })
    }

    return result
  } catch (err) {
    // 部分上传失败：回滚已上传的文件
    for (const { url } of uploaded) {
      void deleteArtifactFile(url).catch(() => {})
    }
    throw err
  }
}
