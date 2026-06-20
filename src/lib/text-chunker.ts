/**
 * 智能文本分块 + Map-Reduce 摘要工具
 *
 * 用于处理超长文本，避免超出模型上下文窗口。
 * - 按语义边界（段落、句子）切分，尽量不打断理解
 * - 相邻块之间保留重叠，防止跨块信息断层
 * - 超长文本递归摘要，最终合并成一份完整摘要
 */

export interface ChunkOptions {
  /** 每块目标字符数，默认 15000 字 */
  chunkSize?: number
  /** 相邻块重叠字符数，默认 500 字 */
  overlap?: number
}

/**
 * 智能分块：优先按段落切，其次按句子切，保证边界在语义断点上。
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { chunkSize = 15000, overlap = 500 } = options
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (clean.length <= chunkSize) return [clean]

  const chunks: string[] = []
  let start = 0

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length)

    // 尝试在段落边界切
    if (end < clean.length) {
      const paraBreak = findBreakPoint(clean, start, end, '\n\n')
      if (paraBreak > start + chunkSize * 0.5) end = paraBreak + 2
      else {
        // 退而求其次：换行符
        const lineBreak = findBreakPoint(clean, start, end, '\n')
        if (lineBreak > start + chunkSize * 0.5) end = lineBreak + 1
        else {
          // 最后：句号、问号、感叹号
          const sentenceBreak = findBreakPoint(clean, start, end, /[。！？!?\.]/)
          if (sentenceBreak > start + chunkSize * 0.5) end = sentenceBreak + 1
        }
      }
    }

    const chunk = clean.slice(start, end).trim()
    if (chunk) chunks.push(chunk)

    if (end >= clean.length) break
    // 下一块起点回退 overlap
    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}

function findBreakPoint(
  text: string,
  start: number,
  end: number,
  delimiter: string | RegExp,
): number {
  // 从 end 往回找第一个断点，且断点至少在 start + 50% 的位置之后
  const searchRegion = text.slice(start, end)
  let bestPos = -1

  if (typeof delimiter === 'string') {
    let idx = searchRegion.lastIndexOf(delimiter)
    while (idx > searchRegion.length * 0.5 && bestPos === -1) {
      bestPos = start + idx
      idx = searchRegion.lastIndexOf(delimiter, idx - 1)
    }
  } else {
    // regex: find last match within the region
    const matches = [...searchRegion.matchAll(new RegExp(delimiter.source, 'g'))]
    for (let i = matches.length - 1; i >= 0; i--) {
      const pos = matches[i].index ?? -1
      if (pos > searchRegion.length * 0.5) {
        bestPos = start + pos
        break
      }
    }
  }

  return bestPos
}

/**
 * 估算中文字符串的 token 数（粗略但足够用）
 * 中文: 1字 ≈ 1.5 token
 * 英文: 1词 ≈ 1.3 token
 * 综合估算: 按字符数 * 1.2 保守估计
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // 简化：字符数 * 1.2 作为粗略 token 估算
  return Math.ceil(text.length * 1.2)
}

export interface SummarizeChunkOptions {
  /** 单块触发分块的阈值字符数，默认 30000 */
  threshold?: number
  /** 分块大小 */
  chunkSize?: number
  /** 目标摘要长度（字符数），默认约为原文的 20% */
  targetRatio?: number
}

/**
 * 对超长文本做 Map-Reduce 式摘要，保留关键信息。
 *
 * 调用方需要传入一个实际执行 AI 摘要的函数（因为不同场景用不同的 prompt 和调用方式）。
 *
 * @param text 原始文本
 * @param summarizeFn 单块摘要函数，输入 (chunk, context) 返回摘要文本
 * @param options 分块参数
 */
export async function mapReduceSummarize(
  text: string,
  summarizeFn: (chunk: string, context: string) => Promise<string>,
  options: SummarizeChunkOptions = {},
): Promise<string> {
  const {
    threshold = 30000,
    chunkSize = 20000,
    targetRatio = 0.2,
  } = options

  if (text.length <= threshold) return text // 不长，直接返回原文

  const chunks = chunkText(text, { chunkSize, overlap: 500 })
  if (chunks.length <= 1) return text

  // Map 阶段：逐块摘要
  let context = ''
  const summaries: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const summary = await summarizeFn(chunk, context)
    summaries.push(summary)
    // 前一块摘要作为下一块的上下文，帮助保持连贯
    context = summary.slice(0, 1000)
  }

  // Reduce 阶段：合并所有摘要，再做一轮总摘要
  let merged = summaries.join('\n\n---\n\n')

  // 如果合并后还是超长，递归
  const maxMerged = Math.ceil(threshold * 0.8)
  if (merged.length > maxMerged) {
    return mapReduceSummarize(
      merged,
      summarizeFn,
      { threshold: maxMerged, chunkSize: Math.ceil(chunkSize * 0.8), targetRatio },
    )
  }

  return merged
}
