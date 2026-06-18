// Streaming SSE endpoint for screenshot analysis
// - Node.js runtime (Prisma needs TCP for Neon)
// - AI call streamed via SSE, DB persist happens at end
// - Returns 200 immediately on first byte so client gets fast feedback
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { buildScreenshotAnalysisPrompt, buildDashboardAnalysisPrompt } from '@/lib/ai-prompts'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  const { id } = await params

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
    where: { id, userId: session.userId },
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

  const prompt = type === 'dashboard' ? buildDashboardAnalysisPrompt() : buildScreenshotAnalysisPrompt()

  // Build multimodal messages
  const userContent: any[] = [{ type: 'text', text: prompt }]
  for (const url of images) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  const baseUrl = aiConfig.baseUrl.replace(/\/$/, '')

  const encoder = new TextEncoder()
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        send('start', { ts: Date.now() })

        const fullUrl = baseUrl.endsWith('/v1') ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
        const res = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + aiConfig.apiKey,
            
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: [{ role: 'user', content: userContent }],
            max_tokens: 4000,
            max_completion_tokens: 4000,
            temperature: 0.2,
            stream: true,
          }),
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => '')
          let hint = ''
          if (res.status === 401) hint = 'API Key 无效'
          else if (res.status === 404) hint = 'Base URL 或模型名称错误'
          else if (res.status === 429) hint = '触发限流，请稍后重试'
          else if (res.status >= 500) hint = '视觉模型服务端异常，请稍后重试'
        send('error', { status: res.status, message: ('URL: ' + fullUrl + '  ERR: ' + (errText || hint || '视觉模型调用失败')).slice(0, 800), hint })
          controller.close()
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
              const delta = payload.choices?.[0]?.delta?.content
                ?? payload.choices?.[0]?.message?.content
                ?? payload.delta?.text
              if (delta) {
                fullText += delta
                send('delta', { text: delta })
              }
            } catch {}
          }
        }

        // Persist to DB
        const clean = fullText
          .replace(/<think>[\s\S]*?<\/think>/g, '')
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

        const inserted: string[] = []
        const updated: string[] = []
        try {
          const models = parsed?.models
          if (models && Array.isArray(models)) {
            for (const m of models) {
              if (!m.modelCode) continue
              const existing = task.models.find((tm: any) => tm.modelCode === m.modelCode)
              if (type === 'dashboard') {
                if (existing) {
                  await prisma.taskModel.update({
                    where: { id: existing.id },
                    data: { hardMetricsJson: JSON.stringify(m.metrics || m) },
                  })
                  updated.push(m.modelCode)
                } else {
                  await prisma.taskModel.create({
                    data: {
                      taskId: id,
                      modelCode: m.modelCode,
                      displayName: m.displayName || m.modelCode,
                      hardMetricsJson: JSON.stringify(m.metrics || m),
                    },
                  })
                  inserted.push(m.modelCode)
                }
              } else {
                if (existing) {
                  await prisma.taskModel.update({
                    where: { id: existing.id },
                    data: {
                      processText: m.processDetail || m.processSummary || existing.processText,
                      screenshotUrls: images.length + ' images',
                    },
                  })
                  updated.push(m.modelCode)
                } else {
                  await prisma.taskModel.create({
                    data: {
                      taskId: id,
                      modelCode: m.modelCode,
                      displayName: m.displayName || m.modelCode,
                      processText: m.processDetail || m.processSummary,
                      screenshotUrls: images.length + ' images',
                    },
                  })
                  inserted.push(m.modelCode)
                }
              }
            }
          }
          await prisma.task.update({ where: { id }, data: { currentStep: 'SCREENSHOT' } })
        } catch (dbErr: any) {
          send('error', { message: '数据库写入失败：' + (dbErr?.message || String(dbErr)) })
          controller.close()
          return
        }

        let chatSummary: string
        if (inserted.length === 0 && updated.length === 0) {
          chatSummary = '## 看板识别未提取到模型\n\n' +
            'AI 似乎没在图里识别到结构化表格数据。你可以：\n' +
            '1) 重截更清晰的看板\n' +
            '2) 在第 4 步手动添加模型\n\n' +
            'AI 原始返回：\n\n```\n' + (fullText || '(空)') + '\n```'
        } else {
          const ins = inserted.length > 0 ? '新增 ' + inserted.length + ' 个模型（' + inserted.join('、') + '）' : ''
          const upd = updated.length > 0 ? '更新 ' + updated.length + ' 个模型（' + updated.join('、') + '）' : ''
          chatSummary = '## 看板识别完成\n\n' + [ins, upd].filter(Boolean).join('，') + '。'
        }
        try {
          await prisma.taskMessage.create({
            data: { taskId: id, role: 'assistant', content: chatSummary, step: 'SCREENSHOT' },
          })
        } catch {}

        send('done', { inserted, updated, parsed, raw: fullText })
      } catch (e: any) {
        send('error', { message: e?.message || String(e) })
      } finally {
        try { controller.close() } catch {}
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
