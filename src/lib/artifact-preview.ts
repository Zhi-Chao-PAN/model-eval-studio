export type ArtifactPreviewKind = 'document' | 'table' | 'html' | 'code' | 'text' | 'image' | 'metadata'

export interface StoredArtifactPreview {
  version: 1
  source: 'file' | 'archive'
  sourceName: string
  primaryName: string
  primaryKind: ArtifactPreviewKind
  renderMode: 'direct-image' | 'converted-document' | 'structured-table' | 'sanitized-html' | 'plain-text' | 'legacy-extract'
  html?: string
  text?: string
  entries?: Array<{ name: string; kind: ArtifactPreviewKind }>
}

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'kt', 'go', 'rs', 'c', 'cc', 'cpp',
  'h', 'hpp', 'cs', 'php', 'rb', 'swift', 'vue', 'svelte', 'sql', 'sh', 'ps1', 'bat', 'toml',
])

const ARCHIVE_JUNK_SEGMENTS = new Set([
  '__macosx', 'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode', '.fonts', 'fonts',
  'vendor', 'coverage', '.next', '.cache', '.pytest_cache', '__pycache__',
])

const ARCHIVE_JUNK_EXTENSIONS = new Set([
  'otf', 'ttf', 'woff', 'woff2', 'eot', 'map', 'lock', 'pyc', 'pyo', 'class', 'dll', 'exe', 'bin',
  'so', 'dylib', 'ico', 'ds_store',
])

export function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function inferArtifactPreviewKind(name: string): ArtifactPreviewKind {
  const ext = fileExtension(name)
  if (['docx', 'pdf', 'pptx', 'md', 'markdown'].includes(ext)) return 'document'
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return 'table'
  if (['html', 'htm', 'xhtml'].includes(ext)) return 'html'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (['txt', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'log'].includes(ext)) return 'text'
  return 'metadata'
}

export function shouldIgnoreArchiveEntry(name: string): boolean {
  const normalized = name.replace(/\\/g, '/').toLowerCase()
  const segments = normalized.split('/').filter(Boolean)
  const basename = segments.at(-1) || ''
  if (!basename || basename.startsWith('.') || basename.startsWith('~$')) return true
  if (segments.some(segment => ARCHIVE_JUNK_SEGMENTS.has(segment))) return true
  return ARCHIVE_JUNK_EXTENSIONS.has(fileExtension(basename))
}

export function isJunkArtifactText(text: string): boolean {
  const sample = text.slice(0, 12_000).toLowerCase()
  return (
    sample.includes('<title>page not found · github') ||
    sample.includes('this is not the web page you are looking for') ||
    sample.includes('404: not found') ||
    sample.includes('repository not found')
  )
}

export function artifactEntryScore(name: string, kind = inferArtifactPreviewKind(name), text = ''): number {
  const ext = fileExtension(name)
  const lower = name.toLowerCase()
  const base: Record<ArtifactPreviewKind, number> = {
    document: ext === 'docx' ? 125 : ext === 'pdf' ? 120 : 105,
    table: ext === 'xlsx' || ext === 'xls' ? 118 : 108,
    html: /(^|\/)index\.html?$/i.test(name) ? 112 : 96,
    image: 90,
    code: 58,
    text: 68,
    metadata: 10,
  }
  let score = base[kind]
  if (/(报告|白皮书|评估|总结|成果|交付|result|report|summary|deliverable)/i.test(lower)) score += 28
  if (/(测算|数据|清单|明细|分析|dashboard|app|tool)/i.test(lower)) score += 12
  if (/(readme|license|changelog|package\.json|requirements\.txt)/i.test(lower)) score -= 24
  score -= Math.min(18, (name.match(/[\\/]/g)?.length || 0) * 3)
  if (!text.trim()) score -= 35
  if (isJunkArtifactText(text)) score -= 200
  return score
}

export function escapePreviewHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizePreviewHtml(value: string): string {
  return value
    .replace(/<(script|iframe|object|embed|form|base)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|form|base)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?refresh\1?[^>]*>/gi, '')
}

export function textDocumentHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const chunks: string[] = []
  let firstContent = true
  for (const rawLine of lines.slice(0, 500)) {
    const line = rawLine.trim()
    if (!line) continue
    const markdownHeading = line.match(/^(#{1,4})\s+(.+)$/)
    if (markdownHeading) {
      const level = Math.min(3, markdownHeading[1].length + 1)
      chunks.push(`<h${level}>${escapePreviewHtml(markdownHeading[2])}</h${level}>`)
    } else if (firstContent) {
      chunks.push(`<h1>${escapePreviewHtml(line)}</h1>`)
    } else if (/^(?:[一二三四五六七八九十]+[、.]|\d+[、.．]|第[一二三四五六七八九十]+[章节部分])/.test(line)) {
      chunks.push(`<h2>${escapePreviewHtml(line)}</h2>`)
    } else {
      chunks.push(`<p>${escapePreviewHtml(line)}</p>`)
    }
    firstContent = false
  }
  return chunks.join('\n')
}

export function tableTextHtml(text: string): string {
  const rows = text.replace(/\r\n?/g, '\n').split('\n')
    .filter(line => line.trim() && !/^##\s+Sheet:/i.test(line.trim()))
    .slice(0, 120)
    .map(line => line.split(/\s*\|\s*|\t|,(?=(?:[^"\n]*"[^"\n]*")*[^"\n]*$)/).slice(0, 24))
  if (!rows.length) return '<p>表格中没有可展示的数据。</p>'
  return `<table><thead><tr>${rows[0].map(cell => `<th>${escapePreviewHtml(cell.replace(/^"|"$/g, ''))}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${escapePreviewHtml(cell.replace(/^"|"$/g, ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

export function parseStoredArtifactPreview(raw?: string | null): StoredArtifactPreview | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredArtifactPreview>
    if (value.version !== 1 || typeof value.primaryName !== 'string' || typeof value.primaryKind !== 'string') return null
    return value as StoredArtifactPreview
  } catch {
    return null
  }
}

export function buildPreviewFrameDocument(preview: StoredArtifactPreview): string {
  const content = sanitizePreviewHtml(preview.html || '') || (
    preview.primaryKind === 'table'
      ? tableTextHtml(preview.text || '')
      : preview.primaryKind === 'code' || preview.primaryKind === 'text'
        ? `<pre>${escapePreviewHtml((preview.text || '').slice(0, 90_000))}</pre>`
        : textDocumentHtml(preview.text || '')
  )
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:38px 48px;background:#fff;color:#172033;font:15px/1.72 "Microsoft YaHei","PingFang SC",Arial,sans-serif}
    h1{font-size:28px;line-height:1.35;margin:0 0 24px;color:#111827}h2{font-size:19px;margin:28px 0 10px;color:#172033}h3{font-size:16px;margin:22px 0 8px}p{margin:8px 0}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #d7dde8;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eef2f7;font-weight:700;position:sticky;top:0}tbody tr:nth-child(even){background:#f8fafc}
    pre{white-space:pre-wrap;word-break:break-word;background:#f5f7fa;border:1px solid #dfe4ec;padding:20px;font:13px/1.62 Consolas,"SFMono-Regular",monospace;color:#172033}
    img{max-width:100%;height:auto}a{color:#2563eb;text-decoration:none}
  </style></head><body>${content}</body></html>`
}

export function buildLegacyArchivePreview(archiveName: string, parsedText: string): StoredArtifactPreview | null {
  const marker = /^===\s+(.+?)\s+===\s*$/gm
  const matches = Array.from(parsedText.matchAll(marker))
  const candidates = matches.map((match, index) => {
    const name = match[1].trim()
    const start = (match.index || 0) + match[0].length
    const end = matches[index + 1]?.index ?? parsedText.length
    const text = parsedText.slice(start, end).trim()
    const kind = inferArtifactPreviewKind(name)
    return { name, text, kind, score: artifactEntryScore(name, kind, text) }
  }).filter(item => !shouldIgnoreArchiveEntry(item.name) && !isJunkArtifactText(item.text) && item.score > 0)

  const primary = candidates.sort((a, b) => b.score - a.score)[0]
  if (!primary) return null
  const html = primary.kind === 'table'
    ? tableTextHtml(primary.text)
    : primary.kind === 'html'
      ? sanitizePreviewHtml(primary.text)
      : primary.kind === 'code'
        ? `<pre>${escapePreviewHtml(primary.text.slice(0, 90_000))}</pre>`
        : textDocumentHtml(primary.text)

  return {
    version: 1,
    source: 'archive',
    sourceName: archiveName,
    primaryName: primary.name,
    primaryKind: primary.kind,
    renderMode: 'legacy-extract',
    html,
    text: primary.text,
    entries: candidates.slice(0, 80).map(item => ({ name: item.name, kind: item.kind })),
  }
}
