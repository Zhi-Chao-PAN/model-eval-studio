const fs = require('fs');
const path = require('path');
const BASE = 'E:/projects/model-test-assistant';

const content = `
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai-prompts'

// 通用对话接口：每一步都可以用，AI 知道当前任务和上下文
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id } = await params
  const { message, step, modelId } = await request.json()

  if (!message || !step) {
    return NextResponse.json({ error: 'message 和 step 必填' }, { status: 400 })
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: session.userId },
    include: {
      models: { include: { artifacts: true, reports: { take: 1, orderBy: { createdAt: 'desc' } } } },
      attachments: true,
    },
  })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  const aiConfig = await getUserAiConfig(session.userId)
  if (!aiConfig) {
    return NextResponse.json({ error: '请先配置 AI API' }, { status: 400 })
  }

  // 获取历史消息（最近 20 条）
  const history = await prisma.taskMessage.findMany({
    where: { taskId: id, step },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  history.reverse()

  // 构建系统提示 + 任务上下文
  let context = \`当前任务：\${task.title}
当前步骤：\${step}
任务说明：\${task.description || '无'}
用户背景：\${task.backgroundUsed || aiConfig.background}
\`

  // 加上模型信息
  if (task.models.length > 0) {
    context += '\\n待测模型：\\n'
    for (const m of task.models) {
      context += \`- \${m.modelCode}\`
      if (m.hardMetricsJson) context += \`（硬指标：\${m.hardMetricsJson.slice(0, 100)}...）\`
      context += '\\n'
    }
  }

  if (modelId) {
    const m = task.models.find((x) => x.id === modelId)
    if (m) {
      context += \`\\n当前讨论的模型：\${m.modelCode}\\n\`
      const latestReport = m.reports?.[0]
      if (latestReport) {
        context += \`已有报告：综合评分 \${latestReport.overallScore}\\n\`
      }
    }
  }

  // 构造消息链
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(task.backgroundUsed || aiConfig.background) + '\\n\\n' + context },
    ...history.map((m) => ({ role: m.role as any, content: m.content })),
    { role: 'user' as const, content: message },
  ]

  // 调用 AI
  const reply = await generateChat(messages, {
    baseUrl: aiConfig.baseUrl,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    provider: aiConfig.provider as any,
    temperature: 0.7,
    maxTokens: 2000,
  })

  // 保存两条消息
  const [userMsg, assistantMsg] = await Promise.all([
    prisma.taskMessage.create({
      data: { taskId: id, role: 'user', content: message, step, modelId },
    }),
    prisma.taskMessage.create({
      data: { taskId: id, role: 'assistant', content: reply, step, modelId },
    }),
  ])

  return NextResponse.json({
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    reply,
  })
}
`.trim();

fs.writeFileSync(path.join(BASE, 'src/app/api/tasks/[id]/chat/route.ts'), content, 'utf-8');
console.log('chat api written');
'.replace(/\`\`\`/g, '```');
