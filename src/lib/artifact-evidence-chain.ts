/**
 * Artifact Evidence Chain
 * ──────────────────────
 * 纯 TypeScript 数据结构，用于记录"产物分析这一步到底看了哪些文件 / 做出了
 * 哪些判断 / 留下了哪些限制"。本模块只负责构造与序列化，不访问数据库。
 *
 * 关键约束（与长期规则对齐）：
 * - 不包含原始 `think` / 思维链字段；只放可审计的 title / summary / detail。
 * - 长文本做截断，避免把整段产物塞进证据。
 * - 检测并拒绝把 HTML 错误页当证据标题。
 * - evidenceType 限定为枚举；source 区分 `artifact_upload` /
 *   `parser` / `auto_runner` / `analysis_runtime`，让"自动候选证据"与
 *   "正式 tester_upload 截图"在类型层面就分得开。
 *
 * 落库策略：
 * - evidenceChain 通过 `serializeEvidenceChain` 序列化成 JSON 字符串，
 *   存入 `TaskModel.artifactAnalysisJson.evidenceChain`。
 * - 单步事件也可写入 `ArtifactAnalysisEvent.metadata.evidenceSummary`，
 *   以便 UI 即便在没解析 evidenceChain 时也能看到当前步骤的证据摘要。
 */

export const EVIDENCE_TYPE_VALUES = [
  'file_manifest',      // 整个产物包的文件清单
  'parsed_content',     // 单个产物的解析摘要
  'primary_artifact',   // 识别出的主产物
  'structure_check',    // 文档/代码项目结构摘要
  'quality_signal',     // 质量信号（是否有 README / 入口 / 报告等）
  'limitation',         // 自动分析的明确限制
  'auto_candidate',     // 后台候选证据（可以引用到报告，但不能等同本地验收）
  'error',              // 单步失败
] as const

export type EvidenceType = (typeof EVIDENCE_TYPE_VALUES)[number]

export const EVIDENCE_SOURCE_VALUES = [
  'artifact_upload',    // 用户上传的产物本身
  'parser',             // 解析层（docx/pdf/csv 等）
  'auto_runner',        // 自动验收运行器（V1 静态分析）
  'analysis_runtime',   // 调用 AI 的综合分析
] as const

export type EvidenceSource = (typeof EVIDENCE_SOURCE_VALUES)[number]

export interface ArtifactEvidence {
  evidenceId: string
  modelId: string
  artifactId?: string | null
  runId?: string | null
  artifactName?: string | null
  evidenceType: EvidenceType
  source: EvidenceSource
  title: string
  summary: string
  detail?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

// ── 文本截断与清洗 ──────────────────────────────────────────────────────

export const EVIDENCE_TITLE_MAX = 80
export const EVIDENCE_SUMMARY_MAX = 280
export const EVIDENCE_DETAIL_MAX = 1200

const HTML_PATTERN = /<\/?(html|body|head|!doctype)\b/i

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function looksLikeHtmlPage(value: string): boolean {
  return HTML_PATTERN.test(value)
}

function safeTruncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, Math.max(0, max - 1)) + '…'
}

function clampText(value: string, max: number, kind: 'title' | 'summary' | 'detail'): string {
  const cleaned = normalizeWhitespace(value)
  if (!cleaned) return ''
  // 标题若是 HTML 错误页标签，直接给个稳定占位，避免泄漏 markup
  if (kind === 'title' && looksLikeHtmlPage(cleaned)) {
    return 'HTML 错误页（不可解析）'
  }
  if (kind === 'title' || kind === 'summary') {
    return safeTruncate(cleaned, max)
  }
  return safeTruncate(cleaned, max)
}

// ── 构造器 ──────────────────────────────────────────────────────────────

let evidenceCounter = 0

function nextEvidenceId(prefix: string): string {
  evidenceCounter += 1
  // 进程级唯一即可；服务端、客户端、测试都共享这一个闭包。
  // 序列化时只保留 evidenceId，持久化不依赖它，仅作 UI key。
  const time = Date.now().toString(36)
  const counter = evidenceCounter.toString(36)
  return `${prefix}-${time}-${counter}`
}

export interface BuildEvidenceInput {
  modelId: string
  evidenceType: EvidenceType
  source: EvidenceSource
  title: string
  summary: string
  detail?: string
  artifactId?: string | null
  artifactName?: string | null
  runId?: string | null
  metadata?: Record<string, unknown> | null
}

export function buildEvidence(input: BuildEvidenceInput): ArtifactEvidence {
  const title = clampText(input.title, EVIDENCE_TITLE_MAX, 'title') || '未命名证据'
  const summary = clampText(input.summary, EVIDENCE_SUMMARY_MAX, 'summary') || '无摘要'
  const detail = input.detail ? clampText(input.detail, EVIDENCE_DETAIL_MAX, 'detail') : null

  // 防御性 metadata 清洗：不允许任何字段携带原始 think / 思维链
  const sanitizedMetadata = sanitizeMetadata(input.metadata)

  return {
    evidenceId: nextEvidenceId('evi'),
    modelId: input.modelId,
    artifactId: input.artifactId ?? null,
    runId: input.runId ?? null,
    artifactName: input.artifactName ?? null,
    evidenceType: input.evidenceType,
    source: input.source,
    title,
    summary,
    detail,
    metadata: sanitizedMetadata,
    createdAt: new Date().toISOString(),
  }
}

function sanitizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null
  const BANNED_KEYS = new Set(['think', 'reasoning', 'chain_of_thought', 'cot', 'raw_thought'])
  const cleaned: Record<string, unknown> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(metadata)) {
    if (BANNED_KEYS.has(key.toLowerCase())) {
      dropped += 1
      continue
    }
    if (typeof value === 'string') {
      cleaned[key] = safeTruncate(normalizeWhitespace(value), EVIDENCE_DETAIL_MAX)
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      cleaned[key] = value
    } else if (Array.isArray(value)) {
      cleaned[key] = value.slice(0, 32).map(item =>
        typeof item === 'string'
          ? safeTruncate(normalizeWhitespace(item), 280)
          : item,
      )
    } else {
      cleaned[key] = '[object]'
    }
  }
  if (dropped > 0) cleaned._droppedKeys = dropped
  return cleaned
}

// ── 序列化 ──────────────────────────────────────────────────────────────

export interface SerializedEvidenceChain {
  version: 1
  modelId: string
  generatedAt: string
  items: ArtifactEvidence[]
}

export function serializeEvidenceChain(items: ArtifactEvidence[], modelId: string): SerializedEvidenceChain {
  return {
    version: 1,
    modelId,
    generatedAt: new Date().toISOString(),
    items,
  }
}

export function parseStoredEvidenceChain(raw?: string | null): SerializedEvidenceChain | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (
      !value ||
      value.version !== 1 ||
      typeof value.modelId !== 'string' ||
      !Array.isArray(value.items)
    ) {
      return null
    }
    const items: ArtifactEvidence[] = value.items
      .filter((item: any) =>
        item &&
        typeof item.evidenceId === 'string' &&
        typeof item.title === 'string' &&
        typeof item.summary === 'string' &&
        typeof item.evidenceType === 'string' &&
        typeof item.source === 'string',
      )
      .slice(0, 200)
      .map((item: any) => ({
        evidenceId: item.evidenceId,
        modelId: typeof item.modelId === 'string' ? item.modelId : value.modelId,
        artifactId: typeof item.artifactId === 'string' ? item.artifactId : null,
        runId: typeof item.runId === 'string' ? item.runId : null,
        artifactName: typeof item.artifactName === 'string' ? item.artifactName : null,
        evidenceType: item.evidenceType as EvidenceType,
        source: item.source as EvidenceSource,
        title: typeof item.title === 'string' ? item.title : '',
        summary: typeof item.summary === 'string' ? item.summary : '',
        detail: typeof item.detail === 'string' ? item.detail : null,
        metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : null,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      }))
    return {
      version: 1,
      modelId: value.modelId,
      generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date(0).toISOString(),
      items,
    }
  } catch {
    return null
  }
}

// ── 报告引用辅助 ─────────────────────────────────────────────────────────

/**
 * 从 `StoredModelArtifactAnalysis`（含可选 `evidenceChain` JSON 字符串）中
 * 解析出可用的 SerializedEvidenceChain。无 evidenceChain 时返回 null。
 */
export function loadEvidenceChainFromAnalysis(
  analysis: { evidenceChain?: string | null } | null | undefined,
): SerializedEvidenceChain | null {
  if (!analysis || !analysis.evidenceChain) return null
  return parseStoredEvidenceChain(analysis.evidenceChain)
}

/**
 * 给"交付效率 / 产物质量 / 综合评价"准备一段紧凑的证据摘要，注入报告 prompt。
 * 严格过滤：只挑选 auto_runner / parser / analysis_runtime 来源；
 * 不包含 tester_upload 的产物效果截图证据——那块由 `verificationSummary` 负责。
 */
export function buildEvidenceChainSummaryForReport(
  chain: SerializedEvidenceChain | null,
  maxChars = 1800,
): string {
  if (!chain || chain.items.length === 0) return ''
  const allowSources = new Set<EvidenceSource>(['auto_runner', 'parser', 'analysis_runtime'])
  const lines: string[] = []
  let used = 0
  for (const item of chain.items) {
    if (!allowSources.has(item.source as EvidenceSource)) continue
    const head = `· [${item.evidenceType}] ${item.title}`
    const tail = item.summary ? ` — ${item.summary}` : ''
    const line = head + tail
    if (used + line.length + 1 > maxChars) break
    lines.push(line)
    used += line.length + 1
  }
  if (!lines.length) return ''
  return [
    '【后台候选证据摘要（自动运行器 V1 / 解析器 / 综合分析；不代表测试者本地验收）】',
    ...lines,
  ].join('\n')
}