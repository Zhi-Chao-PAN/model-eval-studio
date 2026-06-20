// Streaming SSE endpoint for screenshot analysis
// - Node.js runtime (Prisma needs TCP for Neon)
// - AI call streamed via SSE, DB persist happens at end
// - Returns 200 immediately on first byte so client gets fast feedback
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { buildScreenshotAnalysisPrompt, buildDashboardAnalysisPrompt } from '@/lib/ai-prompts'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now()
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { id } = await params

  let tokenInput: number | null = null
  let tokenOutput: number | null = null

  let images: string[] = []
  let type: 'process' | 'dashboard' = 'process'
  try {
    const body = await request.json()
    images = body.images || []
    type = body.type || 'process'
  } catch {
    return new Response(JSON.stringify({ error: '请求体格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (!Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: '请至少上传 1 张图片' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId, status: { not: 'DELETED' } },
    include: { models: true },
  })
  if (!task) {
    return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return new Response(JSON.stringify({ error: '请先在设置中配置 AI 模型' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (aiConfig.provider !== 'OPENAI_COMPAT') {
    return new Response(JSON.stringify({ error: '截图识别需要 OpenAI 兼容接口' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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
          max_tokens: 12000,
          max_completion_tokens: 12000,
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
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '')
          let hint = ''
          if (res.status === 401) hint = 'API Key 无效'
          else if (res.status === 404) hint = 'Base URL 或模型名称错误'
          else if (res.status === 429) hint = '触发限流，请稍后重试'
          else if (res.status >= 500) hint = '视觉模型服务端异常，请稍后重试'
          const errMsg = ('URL: ' + fullUrl + '  ERR: ' + (errText || hint || '视觉模型调用失败')).slice(0, 800)
          send('error', { status: res.status, message: errMsg, hint })
          controller.close()
          logAudit(request, {
            action: 'AI_SCREENSHOT_ANALYZE',
            userId: session.userId,
            taskId: id,
            status: 'error',
            error: errMsg,
            durationMs: Date.now() - startedAt,
            detail: { imageCount: images.length, type },
          })
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
          send('error', { message: reason })
          return
        }

        const inserted: string[] = []
        const updated: string[] = []
        try {
          for (const m of parsed.models) {
            const modelCode = String(m.modelCode || '').trim().toUpperCase()
            if (!modelCode) continue
            const existing = task.models.find((tm: any) => tm.modelCode.toUpperCase() === modelCode)
            if (type === 'dashboard') {
              if (existing) {
                await prisma.taskModel.update({
                  where: { id: existing.id },
                  data: { hardMetricsJson: JSON.stringify(m.metrics || m) },
                })
                updated.push(modelCode)
              } else {
                await prisma.taskModel.create({
                  data: {
                    taskId: id,
                    modelCode,
                    displayName: m.displayName || modelCode,
                    hardMetricsJson: JSON.stringify(m.metrics || m),
                  },
                })
                inserted.push(modelCode)
              }
            } else if (existing) {
              await prisma.taskModel.update({
                where: { id: existing.id },
                data: {
                  processText: m.processDetail || m.processSummary || existing.processText,
                  screenshotUrls: images.length + ' images',
                },
              })
              updated.push(modelCode)
            } else {
              await prisma.taskModel.create({
                data: {
                  taskId: id,
                  modelCode,
                  displayName: m.displayName || modelCode,
                  processText: m.processDetail || m.processSummary,
                  screenshotUrls: images.length + ' images',
                },
              })
              inserted.push(modelCode)
            }
          }
          await prisma.task.update({ where: { id }, data: { currentStep: 'SCREENSHOT' } })
        } catch (dbErr: any) {
          send('error', { message: '数据库写入失败：' + (dbErr?.message || String(dbErr)) })
          controller.close()
          return
        }

        send('done', { inserted, updated, parsed, raw: clean })
      } catch (e: any) {
        send('error', { message: e?.message || String(e) })
      } finally {
        try { controller.close() } catch {}
        logAudit(request, {
          action: 'AI_SCREENSHOT_ANALYZE',
          userId: session.userId,
          taskId: id,
          status: finishReason === 'length' ? 'error' : (images.length > 0 ? 'success' : 'error'),
          error: finishReason === 'length' ? '输出长度上限' : null,
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
