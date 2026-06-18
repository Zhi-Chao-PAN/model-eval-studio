const fs = require('fs');
const path = require('path');
const BASE = 'E:/projects/model-test-assistant';

function write(p, content) {
  const full = path.join(BASE, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  console.log('wrote:', p);
}

// ============ 1. Chat API ============
write('src/app/api/tasks/[id]/chat/route.ts', `import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { getUserAiConfig } from '@/lib/user-ai'
import { generateChat } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai-prompts'

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

  // 历史消息
  const history = await prisma.taskMessage.findMany({
    where: { taskId: id, step },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  history.reverse()

  // 构建任务上下文
  let context = \`当前任务：\${task.title}
当前步骤：\${step}
任务说明：\${task.description || '无'}
用户背景：\${task.backgroundUsed || aiConfig.background}\`

  if (task.models.length > 0) {
    context += '\n\n待测模型：'
    for (const m of task.models) {
      context += \`\n- \${m.modelCode}\`
      if (m.displayName && m.displayName !== m.modelCode) {
        context += \`（\${m.displayName}）\`
      }
    }
  }

  if (modelId) {
    const m = task.models.find((x: any) => x.id === modelId)
    if (m) {
      context += \`\n\n当前讨论模型：\${m.modelCode}\`
      if (m.reports?.[0]) {
        context += \`，综合评分：\${m.reports[0].overallScore}\`
      }
    }
  }

  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(task.backgroundUsed || aiConfig.background) + '\n\n任务上下文：\n' + context },
    ...history.map((m: any) => ({ role: m.role as any, content: m.content })),
    { role: 'user' as const, content: message },
  ]

  const reply = await generateChat(messages, {
    baseUrl: aiConfig.baseUrl,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    provider: aiConfig.provider as any,
    temperature: 0.7,
    maxTokens: 2000,
  })

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
`)

// ============ 2. 任务详情页的对话组件 ============
// 直接更新任务详情页的对话部分

console.log('all files written');
