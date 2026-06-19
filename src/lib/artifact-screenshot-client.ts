'use client'

type ArtifactLike = {
  name: string
  mimeType?: string | null
  parsedText?: string | null
  textContent?: string | null
  size?: number | null
}

const COLORS = {
  titleBarBg: '#252526',
  titleBarText: '#cccccc',
  tabBg: '#1e1e1e',
  editorBg: '#1e1e1e',
  gutterText: '#858585',
  textNormal: '#d4d4d4',
  textComment: '#6a9955',
  textKeyword: '#569cd6',
  textString: '#ce9178',
  statusBarBg: '#007acc',
  statusBarText: '#ffffff',
  trafficRed: '#ff5f56',
  trafficYellow: '#ffbd2e',
  trafficGreen: '#27c93f',
  tabActiveBorder: '#007fd4',
  selectionBg: 'rgba(255,255,255,0.08)',
  lineNumberBg: '#1e1e1e',
  white: '#ffffff',
}

function getExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function getLangLabel(name: string, mimeType?: string | null): string {
  const ext = getExt(name)
  const map: Record<string, string> = {
    md: 'Markdown', markdown: 'Markdown', txt: 'Plain Text', json: 'JSON',
    js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX', py: 'Python',
    pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint',
    csv: 'CSV', html: 'HTML', css: 'CSS', xml: 'XML', yaml: 'YAML', yml: 'YAML',
  }
  if (map[ext]) return map[ext]
  if (mimeType) {
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('word')) return 'Word'
    if (mimeType.includes('excel')) return 'Excel'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint'
    if (mimeType.includes('image')) return 'Image'
    if (mimeType.includes('zip')) return 'Archive'
  }
  return ext.toUpperCase() || 'Text'
}

function getFileIconBadge(name: string): { label: string; bg: string } {
  const ext = getExt(name)
  if (ext.match(/^(md|markdown|txt)$/)) return { label: 'MD', bg: '#519aba' }
  if (ext === 'json') return { label: '{}', bg: '#cbcb41' }
  if (ext.match(/^(js|ts|tsx|jsx)$/)) return { label: 'JS', bg: '#519aba' }
  if (ext === 'py') return { label: 'Py', bg: '#3572A5' }
  if (ext === 'pdf') return { label: 'PDF', bg: '#b30b00' }
  if (ext.match(/^(docx|doc)$/)) return { label: 'W', bg: '#2b579a' }
  if (ext.match(/^(xlsx|xls|csv)$/)) return { label: 'X', bg: '#217346' }
  if (ext.match(/^(pptx|ppt)$/)) return { label: 'P', bg: '#d24726' }
  if (ext.match(/^(zip|rar|7z|tar|gz)$/)) return { label: 'ZIP', bg: '#e3a000' }
  if (ext.match(/^(html|css|xml)$/)) return { label: '</>', bg: '#e34c26' }
  return { label: 'TXT', bg: '#858585' }
}

function lineColor(line: string, ext: string): string {
  const t = line.trimStart()
  if (ext.match(/^(md|markdown|txt)$/)) {
    if (/^#{1,6}\s/.test(t)) return COLORS.textKeyword
    if (/^\s*[-*]\s/.test(t)) return COLORS.textString
    return COLORS.textNormal
  }
  if (ext.match(/^(json|js|ts|tsx|jsx|java|c|cpp|cs|go|rs|css|html|xml)$/)) {
    if (line.includes('//')) return COLORS.textComment
  }
  if (ext.match(/^(py|yaml|yml|toml)$/)) {
    if (t.startsWith('#')) return COLORS.textComment
  }
  return COLORS.textNormal
}

function truncateLines(text: string, maxLines: number, maxChars: number): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const l = lines[i]
    out.push(l.length > maxChars ? l.slice(0, maxChars - 1) + '…' : l)
  }
  if (lines.length > maxLines) {
    out.push(`… (${lines.length - maxLines} more lines)`)
  }
  return out
}

/**
 * Draw a rounded rect on a CanvasRenderingContext2D.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Render a verification screenshot (data URL PNG) for one artifact, styled as a
 * VS Code-like code/document editor window. Uses Canvas 2D so it runs in the
 * browser with no native dependencies.
 */
export function renderArtifactScreenshot(
  artifact: ArtifactLike,
  modelCode: string,
  artifactIndex = 0,
  artifactTotal = 1,
): string {
  const textContent = artifact.parsedText || artifact.textContent || ''
  const ext = getExt(artifact.name)
  const langLabel = getLangLabel(artifact.name, artifact.mimeType)
  const badge = getFileIconBadge(artifact.name)
  const totalChars = textContent.length
  const totalLines = textContent ? textContent.replace(/\r\n/g, '\n').split('\n').length : 0
  const sizeKB = artifact.size ? (artifact.size / 1024).toFixed(1) + ' KB' : ''

  // Layout
  const dpr = window.devicePixelRatio || 1
  const width = 1280
  const titleH = 40
  const tabH = 36
  const statusH = 28
  const fontSize = 14
  const lineH = 22
  const pad = 18
  const gutterW = 64
  const maxLines = 40
  const maxChars = 110

  const contentLines = textContent
    ? truncateLines(textContent, maxLines, maxChars)
    : ['[Binary / non-text file]']

  const editorH = contentLines.length * lineH + pad * 2
  const height = titleH + tabH + editorH + statusH

  const canvas = document.createElement('canvas')
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(dpr, dpr)
  ctx.textBaseline = 'top'
  ctx.textRendering = 'geometricPrecision'

  // --- Title bar ---
  ctx.fillStyle = COLORS.titleBarBg
  ctx.fillRect(0, 0, width, titleH)

  // Traffic lights
  const lights = [COLORS.trafficRed, COLORS.trafficYellow, COLORS.trafficGreen]
  lights.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(18 + i * 20, titleH / 2, 6, 0, Math.PI * 2)
    ctx.fill()
  })

  // Title text
  ctx.fillStyle = COLORS.titleBarText
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  const titleText = `${artifact.name}${artifactTotal > 1 ? ` (${artifactIndex + 1}/${artifactTotal})` : ''} — ${modelCode}`
  ctx.fillText(titleText, width / 2, (titleH - 14) / 2)
  ctx.textAlign = 'left'

  // --- Tab bar ---
  ctx.fillStyle = COLORS.tabBg
  ctx.fillRect(0, titleH, width, tabH)

  // Active tab
  const tabPad = 14
  const badgeW = ctx.measureText(badge.label).width + 12
  const nameW = Math.min(
    ctx.measureText(artifact.name).width + 20,
    400,
  )
  const tabW = tabPad * 2 + badgeW + 8 + nameW + 24
  const tabY = titleH + 2
  const tabX = 8
  ctx.fillStyle = COLORS.editorBg
  roundRect(ctx, tabX, tabY, tabW, tabH - 2, 6)
  ctx.fill()
  // Top border accent
  ctx.fillStyle = COLORS.tabActiveBorder
  ctx.fillRect(tabX, tabY, tabW, 1)
  // Tab badge
  ctx.fillStyle = badge.bg
  roundRect(ctx, tabX + tabPad, tabY + 8, badgeW, 20, 3)
  ctx.fill()
  ctx.fillStyle = COLORS.white
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(badge.label, tabX + tabPad + badgeW / 2, tabY + 11)
  ctx.textAlign = 'left'
  // Tab filename
  ctx.fillStyle = COLORS.white
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(artifact.name, tabX + tabPad + badgeW + 8, tabY + 10)
  // Close X
  ctx.fillStyle = '#858585'
  ctx.font = '16px sans-serif'
  ctx.fillText('×', tabX + tabW - 22, tabY + 6)

  // --- Editor area ---
  const editorTop = titleH + tabH
  ctx.fillStyle = COLORS.editorBg
  ctx.fillRect(0, editorTop, width, editorH)

  // Watermark
  ctx.fillStyle = 'rgba(133,133,133,0.6)'
  ctx.font = '10px -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('AI 核验截图 · 模型评测助手', width - 14, editorTop + 10)
  ctx.textAlign = 'left'

  // Gutter background
  ctx.fillStyle = COLORS.lineNumberBg
  ctx.fillRect(0, editorTop, gutterW, editorH)

  // Font for content
  ctx.font = `${fontSize}px "Cascadia Code", "Fira Code", "Consolas", "Microsoft YaHei", monospace`

  contentLines.forEach((line, i) => {
    const y = editorTop + pad + i * lineH
    // Line number
    ctx.fillStyle = COLORS.gutterText
    ctx.font = `${fontSize - 1}px "Cascadia Code", "Consolas", monospace`
    ctx.textAlign = 'right'
    ctx.fillText(String(i + 1).padStart(3, ' '), gutterW - 12, y + 3)
    ctx.textAlign = 'left'
    // Content
    ctx.fillStyle = lineColor(line, ext)
    ctx.font = `${fontSize}px "Cascadia Code", "Consolas", "Microsoft YaHei", monospace`
    ctx.fillText(line || ' ', gutterW + 8, y + 3)
  })

  // --- Status bar ---
  const statusTop = editorTop + editorH
  ctx.fillStyle = COLORS.statusBarBg
  ctx.fillRect(0, statusTop, width, statusH)

  ctx.fillStyle = COLORS.statusBarText
  ctx.font = '11px -apple-system, "Segoe UI", sans-serif'
  const statusItems = [
    '✓ 已核验',
    `模型: ${modelCode}`,
    langLabel,
    'UTF-8',
    'LF',
    `行 ${totalLines}`,
    `字符 ${totalChars}`,
  ]
  if (sizeKB) statusItems.push(sizeKB)
  const now = new Date()
  const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`

  let sx = 12
  statusItems.forEach(item => {
    ctx.fillText(item, sx, statusTop + 7)
    sx += ctx.measureText(item).width + 18
  })
  ctx.textAlign = 'right'
  ctx.fillText(ts, width - 12, statusTop + 7)
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}

/**
 * Render up to 4 verification screenshots for a model's text artifacts.
 * Prefers artifacts with more content; returns { name, dataUrl } array.
 */
export function renderModelVerificationScreenshots(
  modelCode: string,
  artifacts: ArtifactLike[],
): { name: string; dataUrl: string }[] {
  const textArtifacts = artifacts.filter(
    a => (a.parsedText || a.textContent || '').trim().length > 0,
  )
  const ordered = [...textArtifacts].sort((a, b) => {
    const la = (a.parsedText || a.textContent || '').length
    const lb = (b.parsedText || b.textContent || '').length
    return lb - la
  })
  const toRender = ordered.slice(0, 4)

  const results: { name: string; dataUrl: string }[] = []
  for (let i = 0; i < toRender.length; i++) {
    try {
      const dataUrl = renderArtifactScreenshot(toRender[i], modelCode, i, toRender.length)
      if (dataUrl) {
        results.push({
          name: `verification-${toRender[i].name.replace(/[^\w.\-]/g, '_')}.png`,
          dataUrl,
        })
      }
    } catch (err) {
      console.error('Failed to render artifact screenshot', err)
    }
  }
  return results
}
