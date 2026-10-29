export interface RecognizedModel {
  modelCode: string
  displayName?: string
  status?: string
  duration?: string
  toolCalls?: number
  processSummary?: string
  processDetail?: string
  issues?: string[]
  metrics?: Record<string, unknown>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
}

/** Normalize model-generated data before rendering or saving it. */
export function parseRecognizedModels(value: unknown, fallbackCode = '未识别'): RecognizedModel[] {
  const items: unknown[] = Array.isArray(value) ? value
    : isRecord(value) && Array.isArray(value.models) ? value.models : []
  return items.filter(isRecord).map(item => {
    const rawToolCalls = item.toolCalls ?? item.tool_calls
    const toolCalls = typeof rawToolCalls === 'string' && rawToolCalls.trim() ? Number(rawToolCalls) : rawToolCalls
    const rawDuration = item.duration ?? item.elapsed ?? item.elapsedTime ?? item.time
    const issues = item.issues ?? item.problems
    const reserved = new Set([
      'modelCode', 'code', 'name', 'model', 'displayName', 'display_name', 'status',
      'duration', 'elapsed', 'elapsedTime', 'time', 'toolCalls', 'tool_calls',
      'processSummary', 'process_summary', 'processDetail', 'process_detail',
      'issues', 'problems', 'metrics', 'hardMetrics',
    ])
    const metrics = isRecord(item.metrics) ? item.metrics
      : isRecord(item.hardMetrics) ? item.hardMetrics
      : Object.fromEntries(Object.entries(item).filter(([key, val]) =>
        !reserved.has(key) && ['string', 'number', 'boolean'].includes(typeof val)))
    return {
      modelCode: text(item.modelCode, item.code, item.name, item.model) ?? fallbackCode,
      displayName: text(item.displayName, item.display_name),
      status: text(item.status),
      duration: typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? String(rawDuration) : text(rawDuration),
      toolCalls: typeof toolCalls === 'number' && Number.isFinite(toolCalls) ? toolCalls : undefined,
      processSummary: text(item.processSummary, item.process_summary),
      processDetail: text(item.processDetail, item.process_detail),
      issues: Array.isArray(issues) ? issues.filter((issue): issue is string => typeof issue === 'string') : undefined,
      metrics,
    }
  })
}
