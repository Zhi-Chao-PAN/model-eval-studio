'use client'

type ArtifactLike = {
  name: string
  mimeType?: string | null
  parsedText?: string | null
  textContent?: string | null
  size?: number | null
  url?: string | null
}

// ---------- VS Code Dark+ theme colors (realistic) ----------
const C = {
  // Title bar
  titleBar: '#3c3c3c',
  titleBarText: '#cccccc',
  // Activity bar
  activityBar: '#333333',
  // Side bar
  sideBar: '#252526',
  sideBarText: '#cccccc',
  // Editor groups / tabs
  editorGroup: '#1e1e1e',
  tabActive: '#1e1e1e',
  tabInactive: '#2d2d2d',
  tabBorder: '#1e1e1e',
  tabActiveBorder: '#007fd4',
  // Editor
  editorBg: '#1e1e1e',
  editorFg: '#d4d4d4',
  gutterFg: '#858585',
  gutterActive: '#c6c6c6',
  lineNumbers: '#858585',
  editorLineHighlight: 'rgba(255,255,255,0.04)',
  // Syntax colors (Dark+ approximate)
  synKeyword: '#569cd6',    // blue
  synString: '#ce9178',     // orange
  synComment: '#6a9955',    // green
  synNumber: '#b5cea8',     // light green
  synFunction: '#dcdcaa',   // yellow
  synVariable: '#9cdcfe',   // light blue
  synType: '#4ec9b0',       // teal
  synHeading: '#569cd6',    // for md headings
  synMuted: '#808080',
  // Status bar
  statusBar: '#007acc',
  statusBarBg: '#007acc',
  statusBarFg: '#ffffff',
  statusBarRemote: '#16825d',
  noFolder: '#68217a',
  // Common
  white: '#ffffff',
  black: '#000000',
  trafficRed: '#ff5f56',
  trafficYellow: '#ffbd2e',
  trafficGreen: '#27c93f',
  border: '#2d2d2d',
  // macOS dark window (for image preview / binary preview)
  macTitle: '#2a2a2c',
  macTitleInactive: '#3a3a3c',
  macBg: '#1e1e20',
  macSurface: '#2c2c2e',
  macText: '#f5f5f7',
  macMuted: '#98989d',
  macSeparator: '#3a3a3c',
  // Finder / preview
  previewBg: '#141416',
}

function getExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return bytes + ' bytes'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function langForFile(name: string, mimeType?: string | null): string {
  const ext = getExt(name)
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', jsx: 'JavaScript JSX',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
    c: 'C', cpp: 'C++', cs: 'C#', swift: 'Swift',
    md: 'Markdown', markdown: 'Markdown', txt: 'Plain Text', json: 'JSON',
    yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML', html: 'HTML',
    css: 'CSS', scss: 'SCSS', vue: 'Vue', svelte: 'Svelte',
    sh: 'Shell Script', bash: 'Shell Script', zsh: 'Shell Script',
    sql: 'SQL', graphql: 'GraphQL',
  }
  if (map[ext]) return map[ext]
  if (mimeType) {
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('word')) return 'Word'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint'
    if (mimeType.startsWith('image/')) return 'Image'
    if (mimeType.includes('zip')) return 'Zip Archive'
  }
  return ext ? ext.toUpperCase() : 'Plain Text'
}

function isImageFile(name: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(getExt(name))
}

function isBinaryDocument(name: string, mimeType?: string | null): boolean {
  if (isImageFile(name, mimeType)) return false
  const ext = getExt(name)
  return ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'zip', 'rar', '7z', 'tar', 'gz', 'exe', 'dmg', 'pkg'].includes(ext)
    || (!!mimeType && !mimeType.startsWith('text/') && mimeType !== 'application/json')
}

function fileTypeBadge(name: string, mimeType?: string | null): { label: string; bg: string; fg: string } {
  const ext = getExt(name)
  // VS Code-like colored file badges
  if (isImageFile(name, mimeType)) return { label: ext.slice(0, 3).toUpperCase() || 'IMG', bg: '#c2185b', fg: '#fff' }
  if (ext === 'pdf') return { label: 'PDF', bg: '#d32f2f', fg: '#fff' }
  if (ext === 'docx' || ext === 'doc') return { label: 'W', bg: '#2b579a', fg: '#fff' }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return { label: 'X', bg: '#217346', fg: '#fff' }
  if (ext === 'pptx' || ext === 'ppt') return { label: 'P', bg: '#d24726', fg: '#fff' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { label: 'ZIP', bg: '#fbc02d', fg: '#000' }
  if (ext === 'md' || ext === 'markdown') return { label: 'M↓', bg: '#519aba', fg: '#fff' }
  if (ext === 'json') return { label: '{}', bg: '#cbcb41', fg: '#000' }
  if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return { label: ext.toUpperCase(), bg: '#519aba', fg: '#fff' }
  if (ext === 'py') return { label: 'Py', bg: '#3572A5', fg: '#fff' }
  if (ext === 'html') return { label: '</>', bg: '#e44d26', fg: '#fff' }
  if (ext === 'css') return { label: '#', bg: '#563d7c', fg: '#fff' }
  if (ext === 'txt') return { label: 'TXT', bg: '#5c6f7a', fg: '#fff' }
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), bg: '#6e6e6e', fg: '#fff' }
}

function isPlaceholderText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.startsWith('[文件解析失败') || t.startsWith('[无法解析')) return true
  if (t.startsWith('[Binary') || t.startsWith('[非文本文件') || t.startsWith('[二进制文件') || t.startsWith('[图片文件过大')) return true
  return false
}

function effectiveText(a: ArtifactLike): string {
  const t = (a.parsedText || a.textContent || '').trim()
  if (isPlaceholderText(t)) return ''
  return t
}

// ---------- Canvas helpers ----------
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

function paintMacTrafficLights(ctx: CanvasRenderingContext2D, y: number) {
  ;[C.trafficRed, C.trafficYellow, C.trafficGreen].forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(20 + i * 20, y, 6, 0, Math.PI * 2); ctx.fill()
  })
}

// ---------- Renderer 1: VS Code editor window (text/code/markdown) ----------
function drawVsCodeEditor(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike, text: string, W: number,
): HTMLCanvasElement {
  const ext = getExt(a.name)
  const fontSize = 14
  const lineH = 22
  const pad = 16
  const gutterW = 62
  const titleBarH = 22    // custom title bar (macOS-style)
  const activityBarW = 48
  const statusBarH = 22
  const tabH = 35
  const breadcrumbH = 24
  const maxLines = 38
  const maxChars = 130

  const allLines = text.replace(/\r\n/g, '\n').split('\n')
  const lines = allLines.slice(0, maxLines).map(l =>
    l.length > maxChars ? l.slice(0, maxChars - 1) + '…' : l
  )
  const editorH = Math.max(lines.length + 2, 20) * lineH + pad * 2
  const contentW = W - activityBarW
  const H = titleBarH + tabH + breadcrumbH + editorH + statusBarH

  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = H * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'; ctx.textRendering = 'geometricPrecision'

  // ==== Title bar (dark macOS-style with centered title) ====
  ctx.fillStyle = C.titleBar
  ctx.fillRect(0, 0, W, titleBarH)
  paintMacTrafficLights(ctx, titleBarH / 2)
  ctx.fillStyle = '#bbbbbb'
  ctx.font = '12px -apple-system, "Segoe UI", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  const folderPart = a.name.includes('/') ? a.name.split('/').slice(0, -1).join('/') + ' — ' : ''
  ctx.fillText(folderPart + a.name + ' — Visual Studio Code', W / 2, 4)
  ctx.textAlign = 'left'

  // ==== Activity bar (left) ====
  ctx.fillStyle = C.activityBar
  ctx.fillRect(0, titleBarH, activityBarW, H - titleBarH)
  // Activity icons (simplified VS Code icons)
  const icons = [
    { x: 14, y: titleBarH + 10, s: '≡', c: '#ffffff' },      // explorer (active)
    { x: 14, y: titleBarH + 50, s: '🔍', c: '#858585' },    // search
    { x: 14, y: titleBarH + 90, s: '⎙', c: '#858585' },     // source control
    { x: 14, y: titleBarH + 130, s: '▶', c: '#858585' },    // run
    { x: 14, y: titleBarH + 170, s: '▣', c: '#858585' },    // extensions
  ]
  icons.forEach(ic => {
    ctx.fillStyle = ic.c
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(ic.s, activityBarW / 2 + 2, ic.y)
  })
  // Account icon bottom
  ctx.fillStyle = '#858585'
  ctx.font = '14px sans-serif'
  ctx.fillText('⚙', activityBarW / 2 + 2, H - statusBarH - 30)
  ctx.textAlign = 'left'

  // Active indicator bar on activity bar
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, titleBarH + 8, 2, 24)

  // ==== Side bar (file explorer, partial) ====
  const sideBarW = 200
  ctx.fillStyle = C.sideBar
  ctx.fillRect(activityBarW, titleBarH, sideBarW, H - titleBarH - statusBarH)
  // Explorer header
  ctx.fillStyle = '#bbbbbb'
  ctx.font = '600 11px -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('EXPLORER', activityBarW + 16, titleBarH + 10)
  // Folder header
  ctx.fillStyle = '#cccccc'
  ctx.font = '12px -apple-system, sans-serif'
  ctx.fillText('▾  MODEL-EVAL-STUDIO', activityBarW + 8, titleBarH + 32)
  // File tree entries
  ctx.fillStyle = '#969696'
  ctx.font = '11px -apple-system, sans-serif'
  const sbItems = [
    '▸  src',
    '▸  public',
    '▾  outputs',
  ]
  sbItems.forEach((item, i) => ctx.fillText(item, activityBarW + 18, titleBarH + 52 + i * 18))
  // Active file (highlighted)
  const activeFileY = titleBarH + 52 + sbItems.length * 18
  ctx.fillStyle = '#37373d'
  ctx.fillRect(activityBarW + 2, activeFileY - 2, sideBarW - 4, 20)
  ctx.fillStyle = '#ffffff'
  ctx.font = '11px -apple-system, sans-serif'
  const displayName = a.name.length > 24 ? a.name.slice(0, 22) + '…' : a.name
  ctx.fillText('📄 ' + displayName, activityBarW + 24, activeFileY + 3)

  // ==== Editor area (right of sidebar) ====
  const editorLeft = activityBarW + sideBarW
  const editorRight = W

  // Tab bar
  ctx.fillStyle = '#252526'
  ctx.fillRect(editorLeft, titleBarH, editorRight - editorLeft, tabH)
  // One active tab
  const tabW = Math.min(ctx.measureText(a.name).width + 60, contentW - sideBarW - 40)
  ctx.fillStyle = C.tabActive
  ctx.fillRect(editorLeft + 1, titleBarH + 1, tabW, tabH - 2)
  // Active tab top border
  ctx.fillStyle = C.tabActiveBorder
  ctx.fillRect(editorLeft + 1, titleBarH + 1, tabW, 1)
  // Tab icon (badge)
  const badge = fileTypeBadge(a.name, a.mimeType)
  ctx.fillStyle = badge.bg
  rr(ctx, editorLeft + 10, titleBarH + 9, 20, 16, 3); ctx.fill()
  ctx.fillStyle = badge.fg
  ctx.font = 'bold 8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(badge.label.slice(0, 2), editorLeft + 20, titleBarH + 12)
  ctx.textAlign = 'left'
  // Tab filename
  ctx.fillStyle = '#ffffff'
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(a.name.length > 30 ? a.name.slice(0, 28) + '…' : a.name, editorLeft + 36, titleBarH + 11)
  // Close button on tab
  ctx.fillStyle = '#cccccc'
  ctx.font = '14px sans-serif'
  ctx.fillText('×', editorLeft + tabW - 18, titleBarH + 8)

  // Breadcrumb
  ctx.fillStyle = C.editorBg
  ctx.fillRect(editorLeft, titleBarH + tabH, editorRight - editorLeft, breadcrumbH)
  ctx.fillStyle = '#969696'
  ctx.font = '11px -apple-system, sans-serif'
  const crumbs = ['model-eval-studio', 'src', 'outputs', a.name]
  let crumbX = editorLeft + 14
  crumbs.forEach((c, i) => {
    ctx.fillText(c, crumbX, titleBarH + tabH + 6)
    crumbX += ctx.measureText(c).width + 8
    if (i < crumbs.length - 1) {
      ctx.fillText('›', crumbX, titleBarH + tabH + 6)
      crumbX += 10
    }
  })

  // Editor surface
  const editorTop = titleBarH + tabH + breadcrumbH
  ctx.fillStyle = C.editorBg
  ctx.fillRect(editorLeft, editorTop, editorRight - editorLeft, editorH)

  // Line highlight (first line)
  ctx.fillStyle = C.editorLineHighlight
  ctx.fillRect(editorLeft, editorTop + pad, editorRight - editorLeft, lineH)

  // Gutter
  ctx.fillStyle = C.editorBg
  ctx.fillRect(editorLeft, editorTop, gutterW, editorH)
  // Gutter border
  ctx.fillStyle = '#2d2d2d'
  ctx.fillRect(editorLeft + gutterW - 1, editorTop, 1, editorH)

  // Render lines
  ctx.textBaseline = 'top'
  const codeLeft = editorLeft + gutterW
  lines.forEach((line, i) => {
    const y = editorTop + pad + i * lineH
    // Line number
    ctx.fillStyle = i === 0 ? C.gutterActive : C.lineNumbers
    ctx.font = '12px "Cascadia Code", "Consolas", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(String(i + 1), codeLeft - 10, y + 3)
    ctx.textAlign = 'left'
    // Code content with basic syntax coloring
    const color = syntaxColor(line, ext)
    ctx.fillStyle = color
    ctx.font = `${fontSize}px "Cascadia Code", "Fira Code", "Consolas", "Microsoft YaHei", monospace`
    ctx.fillText(line || ' ', codeLeft + 10, y + 3)
  })

  if (allLines.length > maxLines) {
    ctx.fillStyle = C.synMuted
    ctx.font = '12px "Cascadia Code", monospace'
    ctx.fillText(`  … (${allLines.length - maxLines} more lines)`, codeLeft + 10, editorTop + pad + lines.length * lineH + 3)
  }

  // ==== Status bar (VS Code blue) ====
  const sb = titleBarH + tabH + breadcrumbH + editorH
  ctx.fillStyle = C.statusBar
  ctx.fillRect(0, sb, W, statusBarH)
  ctx.fillStyle = C.statusBarFg
  ctx.font = '11px -apple-system, "Segoe UI", sans-serif'
  ctx.textBaseline = 'middle'

  // Remote indicator (purple)
  ctx.fillStyle = C.noFolder
  ctx.fillRect(0, sb, 44, statusBarH)
  ctx.fillStyle = '#fff'
  ctx.fillText('◇', 8, sb + statusBarH / 2)

  // Left side items
  ctx.fillStyle = '#fff'
  let lx = 52
  const branch = '⎇ main'
  ctx.fillText(branch, lx, sb + statusBarH / 2); lx += ctx.measureText(branch).width + 14
  const sync = '↓ 0 ↑ 0'
  ctx.fillText(sync, lx, sb + statusBarH / 2); lx += ctx.measureText(sync).width + 14
  const errors = '⊘ 0   ⚠ 0'
  ctx.fillText(errors, lx, sb + statusBarH / 2); lx += ctx.measureText(errors).width + 14

  // Right side items
  ctx.textAlign = 'right'
  let rx = W - 10
  const lang = langForFile(a.name, a.mimeType)
  ctx.fillText(lang, rx, sb + statusBarH / 2); rx -= ctx.measureText(lang).width + 14
  ctx.fillText('LF', rx, sb + statusBarH / 2); rx -= ctx.measureText('LF').width + 14
  ctx.fillText('UTF-8', rx, sb + statusBarH / 2); rx -= ctx.measureText('UTF-8').width + 14
  ctx.fillText('Spaces: 2', rx, sb + statusBarH / 2); rx -= ctx.measureText('Spaces: 2').width + 14
  const totalLines = allLines.length
  ctx.fillText(`Ln 1, Col 1`, rx, sb + statusBarH / 2); rx -= ctx.measureText('Ln 1, Col 1').width + 14
  ctx.textAlign = 'left'

  return cv
}

function syntaxColor(line: string, ext: string): string {
  const t = line.trimStart()
  if (!t) return C.editorFg
  // Markdown
  if (ext === 'md' || ext === 'markdown') {
    if (/^#{1,6}\s/.test(t)) return C.synHeading
    if (/^\s*[-*+]\s/.test(t) || /^\s*\d+\.\s/.test(t)) return C.synString
    if (/^\s*>\s/.test(t)) return C.synComment
    if (/\*\*[^*]+\*\*/.test(t) || /__[^_]+__/.test(t)) return C.synFunction
    return C.editorFg
  }
  // JSON
  if (ext === 'json') {
    if (t.startsWith('//')) return C.synComment
    if (t.includes('":')) return '#9cdcfe'
    if (/^[}\]],?$/.test(t) || /^[{\[]$/.test(t)) return C.editorFg
  }
  // C-like / JS / TS
  if (['js', 'ts', 'jsx', 'tsx', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'css', 'scss'].includes(ext)) {
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/')) return C.synComment
    if (/^(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|new|async|await|try|catch|throw|default|switch|case|break|continue|public|private|protected|static|void|int|string|bool|boolean|number)\b/.test(t)) return C.synKeyword
    if (/^['"`]/.test(t) || t.includes("'") || t.includes('"')) {
      // Simple: if first non-space is a quote, color as string
      if (/^['"`]/.test(t)) return C.synString
    }
  }
  // Python/yaml
  if (['py', 'yaml', 'yml', 'toml', 'sh', 'bash'].includes(ext)) {
    if (t.startsWith('#')) return C.synComment
    if (/^(def|class|import|from|return|if|elif|else|for|while|try|except|with|as|in|not|and|or|True|False|None|async|await)\b/.test(t)) return C.synKeyword
  }
  // HTML/XML tags
  if (['html', 'xml', 'vue', 'svelte', 'jsx', 'tsx'].includes(ext)) {
    if (/^<\/?[a-zA-Z!]/.test(t)) return C.synKeyword
    if (t.includes('=')) return C.synFunction
  }
  return C.editorFg
}

// ---------- Renderer 2: macOS image viewer ----------
function drawImagePreview(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike, W: number,
  loadedImage?: HTMLImageElement,
): HTMLCanvasElement {
  const titleH = 38
  const toolH = 0
  const pad = 50
  const imgAreaH = 580
  const statusH = 26
  const H = titleH + toolH + imgAreaH + statusH

  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = H * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  // Title bar (dark macOS)
  ctx.fillStyle = C.macTitle
  ctx.fillRect(0, 0, W, titleH)
  paintMacTrafficLights(ctx, titleH / 2)
  ctx.fillStyle = '#dddddd'
  ctx.font = '12px -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(a.name, W / 2, 12)
  ctx.textAlign = 'left'
  // Toolbar strip
  ctx.fillStyle = '#363638'
  ctx.fillRect(0, titleH, W, 1)

  // Image area (dark checkerboard)
  const areaTop = titleH + toolH
  ctx.fillStyle = C.previewBg
  ctx.fillRect(0, areaTop, W, imgAreaH)
  // Checkerboard
  const sq = 16
  for (let y = 0; y < imgAreaH; y += sq) {
    for (let x = 0; x < W; x += sq) {
      ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'
      ctx.fillRect(x, areaTop + y, sq, sq)
    }
  }

  if (loadedImage) {
    const availW = W - pad * 2, availH = imgAreaH - pad * 2
    const s = Math.min(availW / loadedImage.naturalWidth, availH / loadedImage.naturalHeight, 1.5)
    const dw = loadedImage.naturalWidth * s, dh = loadedImage.naturalHeight * s
    ctx.drawImage(loadedImage, (W - dw) / 2, areaTop + (imgAreaH - dh) / 2, dw, dh)
    // Subtle shadow under image
  } else {
    // Generic image placeholder
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.font = '64px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('🖼', W / 2, areaTop + imgAreaH / 2 - 20)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '13px -apple-system, sans-serif'
    ctx.fillText(a.name, W / 2, areaTop + imgAreaH / 2 + 40)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '11px -apple-system, sans-serif'
    const size = formatSize(a.size)
    ctx.fillText(size !== '—' ? size : '', W / 2, areaTop + imgAreaH / 2 + 60)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  // Status bar (macOS Preview-style bottom bar)
  const sbTop = areaTop + imgAreaH
  ctx.fillStyle = '#2a2a2c'
  ctx.fillRect(0, sbTop, W, statusH)
  ctx.fillStyle = '#999999'
  ctx.font = '11px -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  const size = formatSize(a.size)
  if (loadedImage) {
    ctx.fillText(`${loadedImage.naturalWidth} × ${loadedImage.naturalHeight}`, 14, sbTop + statusH / 2)
    ctx.textAlign = 'right'
    ctx.fillText(size, W - 14, sbTop + statusH / 2)
  } else {
    ctx.fillText(langForFile(a.name, a.mimeType), 14, sbTop + statusH / 2)
    ctx.textAlign = 'right'
    ctx.fillText(size, W - 14, sbTop + statusH / 2)
  }
  ctx.textAlign = 'left'
  return cv
}

// ---------- Renderer 3: macOS Finder / Quick Look for binary docs ----------
function drawBinaryPreview(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike, W: number,
  preview?: string,
): HTMLCanvasElement {
  const titleH = 38
  const bodyH = 480
  const H = titleH + bodyH

  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = H * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  // Title bar
  ctx.fillStyle = C.macTitle
  ctx.fillRect(0, 0, W, titleH)
  paintMacTrafficLights(ctx, titleH / 2)
  ctx.fillStyle = '#dddddd'
  ctx.font = '12px -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(a.name, W / 2, 12)
  ctx.textAlign = 'left'

  // Window body (dark)
  ctx.fillStyle = C.macBg
  ctx.fillRect(0, titleH, W, bodyH)

  // Top: big file icon centered
  const iconSize = 120
  const iconX = W / 2 - iconSize / 2
  const iconY = titleH + 60
  const badge = fileTypeBadge(a.name, a.mimeType)

  // Rounded document icon
  rr(ctx, iconX, iconY, iconSize, iconSize * 1.2, 18)
  const docGrad = ctx.createLinearGradient(iconX, iconY, iconX, iconY + iconSize * 1.2)
  docGrad.addColorStop(0, '#f0f0f0'); docGrad.addColorStop(1, '#d0d0d0')
  ctx.fillStyle = docGrad
  ctx.fill()
  // Page fold
  ctx.fillStyle = '#bbbbbb'
  ctx.beginPath()
  ctx.moveTo(iconX + iconSize - 24, iconY)
  ctx.lineTo(iconX + iconSize, iconY + 24)
  ctx.lineTo(iconX + iconSize, iconY)
  ctx.closePath()
  ctx.fill()
  // Badge in corner
  const bb = 36
  ctx.fillStyle = badge.bg
  rr(ctx, iconX + iconSize - bb - 8, iconY + iconSize * 1.2 - bb - 8, bb, bb * 0.7, 6)
  ctx.fill()
  ctx.fillStyle = badge.fg
  ctx.font = 'bold 13px -apple-system, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(badge.label, iconX + iconSize - bb / 2 - 8, iconY + iconSize * 1.2 - bb / 2 - 8)
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'

  // Filename
  ctx.fillStyle = C.macText
  ctx.font = '600 16px -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(a.name.length > 60 ? a.name.slice(0, 57) + '…' : a.name, W / 2, iconY + iconSize * 1.2 + 24)
  ctx.textAlign = 'left'

  // File size / type
  ctx.fillStyle = C.macMuted
  ctx.font = '12px -apple-system, sans-serif'
  ctx.textAlign = 'center'
  const size = formatSize(a.size)
  const ftype = langForFile(a.name, a.mimeType)
  ctx.fillText(`${ftype}${size !== '—' ? ' · ' + size : ''}`, W / 2, iconY + iconSize * 1.2 + 50)
  ctx.textAlign = 'left'

  // Content preview panel (if we have extracted text)
  const panelY = iconY + iconSize * 1.2 + 86
  const panelH = bodyH - (panelY - titleH) - 24
  if (preview && preview.trim().length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    rr(ctx, 80, panelY, W - 160, panelH, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    rr(ctx, 80, panelY, W - 160, panelH, 10); ctx.stroke()
    // Render text preview
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px "SF Mono", "Cascadia Code", "Consolas", "Microsoft YaHei", monospace'
    const prevLines = preview.slice(0, 800).replace(/\r\n/g, '\n').split('\n').slice(0, 10)
    prevLines.forEach((l, i) => {
      const maxW = W - 200
      let line = l
      while (ctx.measureText(line).width > maxW && line.length > 10) line = line.slice(0, -1)
      if (line !== l) line += '…'
      ctx.fillText(line, 100, panelY + 14 + i * 20)
    })
  } else {
    // "No preview available" panel (like Quick Look for unknown)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    rr(ctx, 80, panelY, W - 160, panelH, 10); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    rr(ctx, 80, panelY, W - 160, panelH, 10); ctx.stroke()
    ctx.fillStyle = C.macMuted
    ctx.font = '13px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('No Preview Available', W / 2, panelY + panelH / 2 - 8)
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillText('This file type cannot be previewed directly.', W / 2, panelY + panelH / 2 + 14)
    ctx.textAlign = 'left'
  }

  return cv
}

// ---------- Renderer 4: Manifest card for models with no artifacts at all ----------
function drawManifest(
  ctx: CanvasRenderingContext2D, dpr: number, modelCode: string, W: number, infos: string[],
): HTMLCanvasElement {
  const titleH = 22
  const H = 520
  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = H * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  ctx.fillStyle = C.titleBar
  ctx.fillRect(0, 0, W, titleH)
  paintMacTrafficLights(ctx, titleH / 2)
  ctx.fillStyle = '#bbbbbb'
  ctx.font = '12px -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Finder', W / 2, 4)
  ctx.textAlign = 'left'

  ctx.fillStyle = C.macBg
  ctx.fillRect(0, titleH, W, H - titleH)

  // Sidebar
  ctx.fillStyle = '#252528'
  ctx.fillRect(0, titleH, 180, H - titleH)
  ctx.fillStyle = '#999'
  ctx.font = '11px -apple-system, sans-serif'
  const favs = ['AirDrop', 'Recents', 'Applications', 'Desktop', 'Documents', 'Downloads', modelCode]
  favs.forEach((f, i) => {
    ctx.fillStyle = i === favs.length - 1 ? '#d0d0d0' : '#858585'
    ctx.fillText('📁 ' + f, 16, titleH + 20 + i * 22)
  })

  // Content
  ctx.fillStyle = C.macText
  ctx.font = '600 18px -apple-system, sans-serif'
  ctx.fillText(modelCode, 210, titleH + 30)
  ctx.fillStyle = C.macMuted
  ctx.font = '12px -apple-system, sans-serif'
  ctx.fillText(`${infos.length} items`, 210, titleH + 56)

  // File icons grid
  const colW = 120
  const cols = Math.floor((W - 220) / colW)
  infos.slice(0, 12).forEach((name, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const gx = 210 + col * colW + 20
    const gy = titleH + 90 + row * 110
    // Mini icon
    const b = fileTypeBadge(name)
    ctx.fillStyle = '#e0e0e0'
    rr(ctx, gx + 16, gy, 48, 58, 6); ctx.fill()
    ctx.fillStyle = b.bg
    rr(ctx, gx + 40, gy + 38, 24, 16, 3); ctx.fill()
    ctx.fillStyle = b.fg
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(b.label.slice(0, 2), gx + 52, gy + 46)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillStyle = C.macText
    ctx.font = '11px -apple-system, sans-serif'
    const dn = name.length > 14 ? name.slice(0, 12) + '…' : name
    ctx.fillText(dn, gx + 40, gy + 66, 80)
    ctx.textAlign = 'left'
  })
  return cv
}

// ---------- Pick which renderer ----------
function pickKind(a: ArtifactLike): 'text' | 'image' | 'binary' {
  if (isImageFile(a.name, a.mimeType)) return 'image'
  if (isBinaryDocument(a.name, a.mimeType)) return 'binary'
  if (effectiveText(a).length >= 10) return 'text'
  // Try by extension
  const ext = getExt(a.name)
  if (['md', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'xml', 'yaml', 'yml', 'csv', 'log', 'sh', 'sql'].includes(ext)) return 'text'
  return 'binary'
}

async function renderOne(
  a: ArtifactLike, modelCode: string, idx: number, total: number,
): Promise<{ name: string; dataUrl: string } | null> {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = 1280
    const cv = document.createElement('canvas')
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    const kind = pickKind(a)
    let out: HTMLCanvasElement

    if (kind === 'image' && a.url && a.url.startsWith('data:image')) {
      let img: HTMLImageElement | undefined
      try {
        img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image()
          i.onload = () => res(i); i.onerror = rej
          i.src = a.url!
        })
      } catch { img = undefined }
      out = drawImagePreview(ctx, dpr, a, W, img)
    } else if (kind === 'image') {
      out = drawImagePreview(ctx, dpr, a, W)
    } else if (kind === 'text') {
      out = drawVsCodeEditor(ctx, dpr, a, effectiveText(a), W)
    } else {
      const raw = effectiveText(a)
      out = drawBinaryPreview(ctx, dpr, a, W, raw || undefined)
    }
    const cleanName = a.name.replace(/[^\w.\-]/g, '_').slice(0, 40)
    return {
      name: `screenshot-${String(idx + 1).padStart(2, '0')}-${cleanName}.png`,
      dataUrl: out.toDataURL('image/png'),
    }
  } catch (e) {
    console.error('Failed to render artifact screenshot', a.name, e)
    return null
  }
}

export async function renderModelVerificationScreenshots(
  modelCode: string,
  artifacts: ArtifactLike[],
): Promise<{ name: string; dataUrl: string }[]> {
  const list = Array.isArray(artifacts) ? artifacts : []
  const order = { text: 0, image: 1, binary: 2 } as const
  const sorted = [...list].sort((a, b) => order[pickKind(a)] - order[pickKind(b)])
  const take = sorted.slice(0, 4)
  const out: { name: string; dataUrl: string }[] = []
  for (let i = 0; i < take.length; i++) {
    const r = await renderOne(take[i], modelCode, i, take.length)
    if (r) out.push(r)
  }
  if (out.length === 0) {
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = 1280
      const cv = document.createElement('canvas')
      const ctx = cv.getContext('2d')
      if (ctx) {
        const info = list.length > 0
          ? list.map(a => a.name)
          : ['output.txt', 'report.md', 'result.json']
        const m = drawManifest(ctx, dpr, modelCode, W, info)
        out.push({ name: 'screenshot-00-finder.png', dataUrl: m.toDataURL('image/png') })
      }
    } catch (e) { console.error(e) }
  }
  return out
}

export function renderModelVerificationScreenshotsSync(
  modelCode: string,
  artifacts: ArtifactLike[],
): { name: string; dataUrl: string }[] {
  const list = Array.isArray(artifacts) ? artifacts : []
  const order = { text: 0, image: 1, binary: 2 } as const
  const sorted = [...list].sort((a, b) => order[pickKind(a)] - order[pickKind(b)])
  const take = sorted.slice(0, 4)
  const out: { name: string; dataUrl: string }[] = []
  for (let i = 0; i < take.length; i++) {
    const a = take[i]
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = 1280
      const cv = document.createElement('canvas')
      const ctx = cv.getContext('2d')
      if (!ctx) continue
      const kind = pickKind(a)
      let m: HTMLCanvasElement
      if (kind === 'image') m = drawImagePreview(ctx, dpr, a, W)
      else if (kind === 'text') m = drawVsCodeEditor(ctx, dpr, a, effectiveText(a), W)
      else m = drawBinaryPreview(ctx, dpr, a, W, effectiveText(a) || undefined)
      out.push({
        name: `screenshot-${String(i + 1).padStart(2, '0')}-${a.name.replace(/[^\w.\-]/g, '_').slice(0, 40)}.png`,
        dataUrl: m.toDataURL('image/png'),
      })
    } catch (e) { console.error(e) }
  }
  if (out.length === 0) {
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = 1280
      const cv = document.createElement('canvas')
      const ctx = cv.getContext('2d')
      if (ctx) {
        const info = list.length > 0 ? list.map(a => a.name) : ['output.txt']
        const m = drawManifest(ctx, dpr, modelCode, W, info)
        out.push({ name: 'screenshot-00-finder.png', dataUrl: m.toDataURL('image/png') })
      }
    } catch {}
  }
  return out
}
