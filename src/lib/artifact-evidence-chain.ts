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
  let value: any
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !value ||
    value.version !== 1 ||
    typeof value.modelId !== 'string' ||
    !Array.isArray(value.items)
  ) {
    return null
  }

  const validSources = new Set<string>(EVIDENCE_SOURCE_VALUES)
  const validTypes = new Set<string>(EVIDENCE_TYPE_VALUES)

  const items: ArtifactEvidence[] = value.items
    .filter((item: any) =>
      item &&
      typeof item.evidenceId === 'string' &&
      typeof item.title === 'string' &&
      typeof item.summary === 'string' &&
      typeof item.evidenceType === 'string' &&
      typeof item.source === 'string' &&
      // 拒绝非法 evidenceType / source，避免老数据污染 UI 与报告 prompt
      validTypes.has(item.evidenceType) &&
      validSources.has(item.source),
    )
    .slice(0, 200)
    .map((item: any) => {
      const evidenceType = item.evidenceType as EvidenceType
      const source = item.source as EvidenceSource
      // 缺失或非 ISO 字符串的 createdAt 给一个稳定 fallback（epoch 0），
      // 避免渲染时拿到 Invalid Date；同时不影响排序（与其它 fallback 一起按 0 排序）。
      const createdAt = typeof item.createdAt === 'string' && item.createdAt
        ? item.createdAt
        : new Date(0).toISOString()
      return {
        evidenceId: item.evidenceId,
        modelId: typeof item.modelId === 'string' ? item.modelId : value.modelId,
        artifactId: typeof item.artifactId === 'string' ? item.artifactId : null,
        runId: typeof item.runId === 'string' ? item.runId : null,
        artifactName: typeof item.artifactName === 'string' ? item.artifactName : null,
        evidenceType,
        source,
        title: safeTruncateText(item.title, EVIDENCE_TITLE_MAX),
        summary: safeTruncateText(item.summary, EVIDENCE_SUMMARY_MAX),
        detail: typeof item.detail === 'string' ? safeTruncateText(item.detail, EVIDENCE_DETAIL_MAX) : null,
        metadata: sanitizeStoredMetadata(item.metadata),
        createdAt,
      }
    })

  const generatedAt = typeof value.generatedAt === 'string' && value.generatedAt
    ? value.generatedAt
    : new Date(0).toISOString()

  return {
    version: 1,
    modelId: value.modelId,
    generatedAt,
    items,
  }
}

function safeTruncateText(value: string, max: number): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, Math.max(0, max - 1)) + '…'
}

/**
 * 对存储在 JSON 中的 metadata 再次清洗：去掉非 plain object、过滤非白名单基础类型、
 * 字符串再截断。保证 UI 与报告 prompt 拿到的 metadata 一定安全。
 */
function sanitizeStoredMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const result: Record<string, unknown> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (typeof value === 'string') {
      const cleaned = safeTruncateText(value, 600)
      if (cleaned) result[key] = cleaned
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 32).map(item =>
        typeof item === 'string' ? safeTruncateText(item, 200) : item,
      )
    } else {
      // 嵌套对象只保留纯字符串描述，避免把任意 JSON 塞到 UI
      dropped += 1
    }
  }
  if (dropped > 0) result._droppedKeys = dropped
  return Object.keys(result).length > 0 ? result : null
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
 * 证据类型在报告 prompt 中的优先级（数字越小越优先）：
 *  - primary_artifact / parsed_content / quality_signal / auto_candidate
 *    是报告生成最常用的参考；
 *  - limitation 必须保留以说明 V1 边界；
 *  - structure_check 与 file_manifest 一般只在前面没有关键证据时补足；
 *  - error 仅在还没有更合适条目时兜底。
 */
export const REPORT_SUMMARY_TYPE_PRIORITY: Record<EvidenceType, number> = {
  primary_artifact: 0,
  quality_signal: 1,
  auto_candidate: 2,
  parsed_content: 3,
  limitation: 4,
  structure_check: 5,
  error: 6,
  file_manifest: 7,
}

export interface EvidenceSummaryOptions {
  maxChars?: number
  /**
   * 允许进入报告 prompt 的 source 白名单。tester_upload 永远不进入；
   * artifact_upload 也不进入（产物本身已在产物文本上下文中）。
   */
  allowSources?: ReadonlySet<EvidenceSource>
}

const DEFAULT_SUMMARY_SOURCES: ReadonlySet<EvidenceSource> = new Set<EvidenceSource>([
  'auto_runner',
  'parser',
  'analysis_runtime',
])

/**
 * 给"交付效率 / 产物质量 / 综合评价"准备一段紧凑的证据摘要，注入报告 prompt。
 *
 * 排序规则：
 *  1. 仅 `auto_runner` / `parser` / `analysis_runtime` 来源会进入；
 *  2. 按 REPORT_SUMMARY_TYPE_PRIORITY 升序：primary_artifact → quality_signal
 *     → auto_candidate → parsed_content → limitation → structure_check →
 *     file_manifest（兜底）；
 *  3. file_manifest 自动被截到 SUMMARY_FILE_MANIFEST_MAX_CHARS，
 *     避免一份长长的文件名清单挤占报告 token 预算。
 */
export function buildEvidenceChainSummaryForReport(
  chain: SerializedEvidenceChain | null,
  options: EvidenceSummaryOptions = {},
): string {
  if (!chain || chain.items.length === 0) return ''
  const maxChars = options.maxChars ?? 1800
  const allowSources = options.allowSources ?? DEFAULT_SUMMARY_SOURCES

  const prioritized = chain.items
    .filter(item => allowSources.has(item.source))
    .slice()
    .sort((a, b) => {
      const pa = REPORT_SUMMARY_TYPE_PRIORITY[a.evidenceType] ?? 99
      const pb = REPORT_SUMMARY_TYPE_PRIORITY[b.evidenceType] ?? 99
      if (pa !== pb) return pa - pb
      // 同优先级按 createdAt 升序，让"先发现"的事实排在前面
      return a.createdAt.localeCompare(b.createdAt)
    })

  const lines: string[] = []
  let used = 0
  for (const item of prioritized) {
    const head = `· [${item.evidenceType}] ${item.title}`
    const tail = item.summary ? ` — ${item.summary}` : ''
    const artifactTag = item.artifactName ? `（${item.artifactName}）` : ''
    let line = head + tail + artifactTag

    // file_manifest 单条单独限长，避免一份巨大清单占用整个摘要预算
    if (item.evidenceType === 'file_manifest' && line.length > SUMMARY_FILE_MANIFEST_MAX_CHARS) {
      line = line.slice(0, SUMMARY_FILE_MANIFEST_MAX_CHARS - 1) + '…'
    }

    if (used + line.length + 1 > maxChars) {
      // 已经写过的条目至少都收下了；这里直接停止，避免截到一半
      break
    }
    lines.push(line)
    used += line.length + 1
  }

  if (!lines.length) return ''
  return [
    '【后台候选证据摘要（来自自动运行器 V1 / 解析器 / 综合分析；这些只是后台候选证据，不等同于测试者本地验收截图，产物效果反馈仍需 tester_upload 截图）】',
    ...lines,
  ].join('\n')
}

export const SUMMARY_FILE_MANIFEST_MAX_CHARS = 360

// ── UI 分组 ──────────────────────────────────────────────────────────────

/**
 * UI 展示用的稳定分组顺序；同一 evidenceType 总是落在同一组，便于用户记忆。
 */
export const EVIDENCE_GROUP_ORDER: ReadonlyArray<{
  key: string
  label: string
  types: ReadonlyArray<EvidenceType>
  description: string
}> = [
  {
    key: 'file_manifest',
    label: '文件清单',
    types: ['file_manifest'],
    description: '本次产物上传过程中识别到的文件清单与过滤结果。',
  },
  {
    key: 'primary',
    label: '主产物识别',
    types: ['primary_artifact'],
    description: '按产物类型、文件名权重、解析文本综合选出的主要产物。',
  },
  {
    key: 'parsed',
    label: '解析证据',
    types: ['parsed_content'],
    description: '解析器从主产物抽出的文本摘要；不展示整篇原文。',
  },
  {
    key: 'structure',
    label: '结构检查',
    types: ['structure_check'],
    description: '工程结构信号：README / 项目清单 / 入口 / 报告等是否存在。',
  },
  {
    key: 'quality',
    label: '质量信号',
    types: ['quality_signal'],
    description: '对产物可读性、可运行性、覆盖完整性的客观判断，仅基于产物内容。',
  },
  {
    key: 'candidate',
    label: '后台候选证据',
    types: ['auto_candidate'],
    description: '可作为交付效率、产物质量、综合评价的参考；不等同于测试者本地验收截图。',
  },
  {
    key: 'limitations',
    label: '限制与风险',
    types: ['limitation'],
    description: '本轮自动验收的明确边界，包括未执行不可信代码、未接入 Sandbox 等。',
  },
  {
    key: 'errors',
    label: '错误',
    types: ['error'],
    description: '证据链生成过程中遇到的具体错误。',
  },
]

export interface EvidenceGroup {
  key: string
  label: string
  description: string
  items: ArtifactEvidence[]
}

export function groupEvidenceByType(items: ArtifactEvidence[]): EvidenceGroup[] {
  const buckets = new Map<string, EvidenceGroup>()
  for (const def of EVIDENCE_GROUP_ORDER) {
    buckets.set(def.key, { key: def.key, label: def.label, description: def.description, items: [] })
  }
  for (const item of items) {
    const def = EVIDENCE_GROUP_ORDER.find(d => d.types.includes(item.evidenceType))
    if (!def) continue
    const group = buckets.get(def.key)
    if (group) group.items.push(item)
  }
  return Array.from(buckets.values()).filter(group => group.items.length > 0)
}