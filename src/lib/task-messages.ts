export interface TaskMessageLike {
  role: string
  content: string
  step: string
}

export interface TaskWorkflowState {
  taskIdeaJson?: string | null
  analysisJson?: string | null
}

export function getWorkflowContent(value?: string | null): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed?.content === 'string' ? parsed.content : null
  } catch {
    return null
  }
}

/**
 * Older workflow endpoints persisted generated panel content as chat messages.
 * Keep those records for compatibility, but exclude them from the user-driven chat.
 */
export function isWorkflowMessage(
  message: TaskMessageLike,
  task: TaskWorkflowState,
): boolean {
  if (message.step === 'IDEA') {
    if (message.role === 'user' && message.content === '帮我生成测试思路') return true
    const idea = getWorkflowContent(task.taskIdeaJson)
    if (message.role === 'assistant' && idea && message.content === idea) return true
  }

  if (message.step === 'ARTIFACT') {
    if (message.role === 'user' && message.content === '整体分析') return true
    const analysis = getWorkflowContent(task.analysisJson)
    if (message.role === 'assistant' && analysis && message.content === analysis) return true
  }

  return message.step === 'SCREENSHOT'
    && message.role === 'assistant'
    && message.content.startsWith('## 看板识别')
}

export function filterConversationMessages<T extends TaskMessageLike>(
  messages: T[],
  task: TaskWorkflowState,
): T[] {
  const hiddenIndexes = new Set<number>()

  messages.forEach((message, index) => {
    if (isWorkflowMessage(message, task)) hiddenIndexes.add(index)

    const isLegacyWorkflowTrigger = message.role === 'user'
      && (
        (message.step === 'IDEA' && message.content === '帮我生成测试思路')
        || (message.step === 'ARTIFACT' && message.content === '整体分析')
      )

    if (isLegacyWorkflowTrigger) {
      hiddenIndexes.add(index)
      const nextMessage = messages[index + 1]
      if (nextMessage?.role === 'assistant' && nextMessage.step === message.step) {
        hiddenIndexes.add(index + 1)
      }
    }
  })

  return messages.filter((_, index) => !hiddenIndexes.has(index))
}
