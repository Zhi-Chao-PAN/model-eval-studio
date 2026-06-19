'use client'

type ArtifactLike = {
  name: string
  mimeType?: string | null
  parsedText?: string | null
  textContent?: string | null
  size?: number | null
  url?: string | null
}

// ---------- Design tokens ----------
const C = {
  bg: '#141417',
  surface: '#1c1c21',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#e4e4e7',
  muted: '#8b8b93',
  dim: '#5c5c64',
  accent: '#818cf8',
  accent2: '#22d3ee',
  success: '#34d399',
  codeBg: '#1e1e1e',
  trafficRed: '#ff5f56',
  trafficYellow: '#ffbd2e',
  trafficGreen: '#27c93f',
}

function getExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getLangLabel(name: string, mimeType?: string | null): string {
  const ext = getExt(name)
  const map: Record<string, string> = {
    md: 'Markdown', markdown: 'Markdown', txt: 'Plain Text', json: 'JSON',
    js: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX', py: 'Python',
    pdf: 'PDF 文档', docx: 'Word 文档', xlsx: 'Excel 表格', pptx: 'PowerPoint',
    csv: 'CSV', html: 'HTML', css: 'CSS', xml: 'XML', yaml: 'YAML', yml: 'YAML',
    zip: 'ZIP 压缩包', png: 'PNG 图片', jpg: 'JPEG 图片', jpeg: 'JPEG 图片',
    gif: 'GIF 图片', webp: 'WebP 图片', svg: 'SVG 图片',
  }
  if (map[ext]) return map[ext]
  if (mimeType) {
    if (mimeType.startsWith('image/')) return '图片文件'
    if (mimeType.includes('pdf')) return 'PDF 文档'
    if (mimeType.includes('word')) return 'Word 文档'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel 表格'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint'
    if (mimeType.includes('zip')) return '压缩包'
  }
  return ext.toUpperCase() + ' 文件' || '文件'
}

function isImageFile(name: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  const ext = getExt(name)
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)
}

function getFileAccent(name: string, mimeType?: string | null): { label: string; bg: string } {
  const ext = getExt(name)
  if (isImageFile(name, mimeType)) return { label: 'IMG', bg: '#d946ef' }
  if (ext === 'pdf') return { label: 'PDF', bg: '#dc2626' }
  if (ext === 'docx' || ext === 'doc') return { label: 'W', bg: '#2563eb' }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return { label: 'X', bg: '#059669' }
  if (ext === 'pptx' || ext === 'ppt') return { label: 'P', bg: '#ea580c' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { label: 'ZIP', bg: '#ca8a04' }
  if (['md', 'markdown', 'txt'].includes(ext)) return { label: 'TXT', bg: '#64748b' }
  if (ext === 'json') return { label: '{}', bg: '#ca8a04' }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css'].includes(ext)) return { label: ext.slice(0, 2).toUpperCase(), bg: '#4f46e5' }
  return { label: (ext || 'F').slice(0, 3).toUpperCase(), bg: '#52525b' }
}

function isPlaceholderText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.startsWith('[文件解析失败') || t.startsWith('[无法解析')) return true
  if (t.startsWith('[Binary') || t.startsWith('[非文本文件') || t.startsWith('[二进制文件')) return true
  return false
}

function effectiveText(a: ArtifactLike): string {
  const t = (a.parsedText || a.textContent || '').trim()
  if (isPlaceholderText(t)) return ''
  return t
}

// ---------- Canvas helpers ----------
function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawCheckBadge(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = 110, h = 26
  ctx.fillStyle = 'rgba(52,211,153,0.15)'
  rr(ctx, x, y, w, h, 13); ctx.fill()
  ctx.strokeStyle = 'rgba(52,211,153,0.45)'
  ctx.lineWidth = 1
  rr(ctx, x, y, w, h, 13); ctx.stroke()
  ctx.fillStyle = C.success
  ctx.beginPath()
  ctx.arc(x + 15, y + 13, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = C.bg
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + 12, y + 13); ctx.lineTo(x + 14.5, y + 15.5); ctx.lineTo(x + 18.5, y + 11)
  ctx.stroke()
  ctx.fillStyle = C.success
  ctx.font = '600 11px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('已核验', x + 27, y + 13)
}

function drawChrome(
  ctx: CanvasRenderingContext2D,
  width: number,
  title: string,
  subtitle: string,
): number {
  const h = 60
  ctx.fillStyle = C.surface
  ctx.fillRect(0, 0, width, h)
  // Top highlight
  const g = ctx.createLinearGradient(0, 0, width, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(16, 0, width - 32, 1)
  // Traffic lights
  ;[C.trafficRed, C.trafficYellow, C.trafficGreen].forEach((c, i) => {
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(20 + i * 22, 22, 6, 0, Math.PI * 2); ctx.fill()
  })
  ctx.fillStyle = C.text
  ctx.font = '600 13px -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(title, width / 2, 20)
  if (subtitle) {
    ctx.fillStyle = C.muted
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillText(subtitle, width / 2, 40)
  }
  ctx.textAlign = 'left'
  return h
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  modelCode: string,
  extra?: string,
) {
  const h = 30
  const g = ctx.createLinearGradient(0, top, width, top)
  g.addColorStop(0, '#4f46e5'); g.addColorStop(1, '#0891b2')
  ctx.fillStyle = g; ctx.fillRect(0, top, width, h)
  ctx.fillStyle = '#fff'
  ctx.font = '11px -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  const parts = ['✓ 已核验', '模型: ' + modelCode]
  if (extra) parts.push(extra)
  let sx = 14
  parts.forEach(p => { ctx.fillText(p, sx, top + h / 2); sx += ctx.measureText(p).width + 16 })
  const now = new Date()
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  ctx.textAlign = 'right'
  ctx.fillText(ts, width - 14, top + h / 2)
  ctx.textAlign = 'left'
  return top + h
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, y: number, m: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = '10px -apple-system, sans-serif'
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'
  ctx.fillText('AI 核验截图 · ' + m, w - 20, y + 12)
  ctx.textAlign = 'left'
}

// ---------- Renderer: text/editor ----------
function drawTextEditor(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike,
  text: string, modelCode: string, W: number,
) {
  const ext = getExt(a.name)
  const pad = 20, gutter = 56, lineH = 21, fs = 13, maxLines = 40, maxChars = 115
  const chromeH = 60, footH = 30
  const lines = text.replace(/\r\n/g, '\n').split('\n').slice(0, maxLines)
    .map(l => l.length > maxChars ? l.slice(0, maxChars - 1) + '…' : l)
  const editorH = Math.max(lines.length, 8) * lineH + pad * 2
  const totalH = chromeH + editorH + footH

  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = totalH * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'; ctx.textRendering = 'geometricPrecision'

  drawChrome(ctx, W, a.name, getLangLabel(a.name, a.mimeType) + ' · AI 核验')

  const eTop = chromeH
  ctx.fillStyle = C.codeBg; ctx.fillRect(0, eTop, W, editorH)
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, eTop, gutter, editorH)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(gutter, eTop, 1, editorH)
  drawWatermark(ctx, W, eTop, modelCode)

  ctx.font = `${fs}px "Cascadia Code","Fira Code","Consolas","Microsoft YaHei",monospace`
  lines.forEach((line, i) => {
    const y = eTop + pad + i * lineH
    ctx.fillStyle = '#858585'
    ctx.font = `${fs - 1}px "Consolas", monospace`
    ctx.textAlign = 'right'
    ctx.fillText(String(i + 1).padStart(3, ' '), gutter - 10, y + 3)
    ctx.textAlign = 'left'
    const trim = line.trimStart()
    let col = '#d4d4d4'
    if (ext === 'md' || ext === 'markdown') {
      if (/^#{1,6}\s/.test(trim)) col = '#569cd6'
      else if (/^\s*[-*+]\s/.test(trim)) col = '#ce9178'
    }
    ctx.fillStyle = col
    ctx.font = `${fs}px "Cascadia Code","Fira Code","Consolas","Microsoft YaHei",monospace`
    ctx.fillText(line || ' ', gutter + 10, y + 3)
  })

  const totalChars = text.length, totalLines = text.split('\n').length
  const size = formatSize(a.size)
  drawFooter(ctx, W, eTop + editorH, modelCode,
    [getLangLabel(a.name, a.mimeType), `行 ${totalLines}`, `字符 ${totalChars}`, size].filter(Boolean).join(' · '))
  return cv
}

// ---------- Renderer: image preview ----------
function drawImagePreview(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike, modelCode: string, W: number,
  loadedImage?: HTMLImageElement,
) {
  const chromeH = 60, pad = 24, areaH = 500, metaH = 70, footH = 30
  const totalH = chromeH + areaH + metaH + footH
  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = totalH * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  drawChrome(ctx, W, a.name, getLangLabel(a.name, a.mimeType) + ' · AI 核验')

  const eTop = chromeH
  ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, eTop, W, areaH)
  drawWatermark(ctx, W, eTop, modelCode)

  if (loadedImage) {
    const availW = W - pad * 2, availH = areaH - pad * 2
    const s = Math.min(availW / loadedImage.naturalWidth, availH / loadedImage.naturalHeight, 1)
    const dw = loadedImage.naturalWidth * s, dh = loadedImage.naturalHeight * s
    const dx = (W - dw) / 2, dy = eTop + (areaH - dh) / 2
    ctx.drawImage(loadedImage, dx, dy, dw, dh)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1
    ctx.strokeRect(dx, dy, dw, dh)
  } else {
    // Checkerboard
    const sq = 20
    for (let y = 0; y < areaH; y += sq) for (let x = 0; x < W; x += sq) {
      ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)'
      ctx.fillRect(x, eTop + y, sq, sq)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '42px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('🖼', W / 2, eTop + areaH / 2 - 18)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '12px -apple-system, sans-serif'
    ctx.fillText(a.name, W / 2, eTop + areaH / 2 + 20)
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }

  const mTop = eTop + areaH
  ctx.fillStyle = C.surface; ctx.fillRect(0, mTop, W, metaH)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, mTop, W, 1)
  drawCheckBadge(ctx, pad, mTop + 22)
  ctx.fillStyle = C.muted
  ctx.font = '11px -apple-system, sans-serif'
  const size = formatSize(a.size)
  const dims = loadedImage ? ` · ${loadedImage.naturalWidth}×${loadedImage.naturalHeight}` : ''
  ctx.fillText(getLangLabel(a.name, a.mimeType) + (size ? ' · ' + size : '') + dims, 150, mTop + 28)
  ctx.fillStyle = C.text
  ctx.font = '600 12px -apple-system, sans-serif'
  ctx.fillText('AI 已打开图像文件进行视觉核验', pad, mTop + 50)

  drawFooter(ctx, W, mTop + metaH, modelCode, '图像文件')
  return cv
}

// ---------- Renderer: binary / file card ----------
function drawBinaryCard(
  ctx: CanvasRenderingContext2D, dpr: number, a: ArtifactLike, modelCode: string, W: number, note?: string,
) {
  const chromeH = 60, cardH = 260, footH = 30, pad = 28, totalH = chromeH + cardH + footH
  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = totalH * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  drawChrome(ctx, W, a.name, getLangLabel(a.name, a.mimeType) + ' · AI 核验')
  const eTop = chromeH
  ctx.fillStyle = C.bg; ctx.fillRect(0, eTop, W, cardH)
  drawWatermark(ctx, W, eTop, modelCode)

  const cw = 480, cx = (W - cw) / 2, cy = eTop + 32, ch = 180
  ctx.fillStyle = C.surface; rr(ctx, cx, cy, cw, ch, 16); ctx.fill()
  ctx.strokeStyle = C.borderStrong; ctx.lineWidth = 1; rr(ctx, cx, cy, cw, ch, 16); ctx.stroke()

  // Big badge
  const accent = getFileAccent(a.name, a.mimeType)
  const bs = 68
  rr(ctx, cx + 36, cy + 40, bs, bs, 14); ctx.fillStyle = accent.bg; ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '700 20px -apple-system, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(accent.label, cx + 36 + bs / 2, cy + 40 + bs / 2)
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'

  // Info next to badge
  const tx = cx + 36 + bs + 22
  ctx.fillStyle = C.text
  ctx.font = '600 16px -apple-system, "Microsoft YaHei", sans-serif'
  let display = a.name
  const maxW = cw - (36 + bs + 58)
  while (ctx.measureText(display).width > maxW && display.length > 8) display = display.slice(0, -1)
  if (display !== a.name) display += '…'
  ctx.fillText(display, tx, cy + 48)
  ctx.fillStyle = C.muted
  ctx.font = '12px -apple-system, sans-serif'
  const parts = [getLangLabel(a.name, a.mimeType)]
  const size = formatSize(a.size)
  if (size) parts.push(size)
  ctx.fillText(parts.join(' · '), tx, cy + 76)
  drawCheckBadge(ctx, tx, cy + 102)

  if (note) {
    ctx.fillStyle = C.dim
    ctx.font = '11px -apple-system, sans-serif'
    ctx.fillText(note.slice(0, 80), cx + 36, cy + ch - 30)
  }

  drawFooter(ctx, W, eTop + cardH, modelCode, '文件已交由 AI 核验')
  return cv
}

// ---------- Renderer: manifest ----------
function drawManifest(
  ctx: CanvasRenderingContext2D, dpr: number, modelCode: string, W: number, infos: string[],
) {
  const chromeH = 60, bodyH = 260, footH = 30, pad = 32, totalH = chromeH + bodyH + footH
  const cv = document.createElement('canvas')
  cv.width = W * dpr; cv.height = totalH * dpr
  ctx.scale(dpr, dpr); ctx.textBaseline = 'top'

  drawChrome(ctx, W, modelCode + ' · 产物核验清单', 'AI 核验系统')
  const eTop = chromeH
  ctx.fillStyle = C.bg; ctx.fillRect(0, eTop, W, bodyH)
  drawWatermark(ctx, W, eTop, modelCode)

  ctx.fillStyle = C.text
  ctx.font = '600 18px -apple-system, "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('模型 ' + modelCode + ' 的产物已核验', W / 2, eTop + 36)
  ctx.fillStyle = C.muted
  ctx.font = '12px -apple-system, sans-serif'
  ctx.fillText('共 ' + infos.length + ' 项产物已提交至 AI 评测系统', W / 2, eTop + 66)
  ctx.textAlign = 'left'

  ctx.font = '12px "Consolas", "Microsoft YaHei", monospace'
  const ly = eTop + 108
  infos.slice(0, 5).forEach((info, i) => {
    ctx.fillStyle = C.success; ctx.fillText('✓', pad, ly + i * 22)
    ctx.fillStyle = i % 2 === 0 ? C.text : C.muted
    let t = info
    const maxW = W - pad * 2 - 28
    while (ctx.measureText(t).width > maxW && t.length > 10) t = t.slice(0, -1)
    if (t !== info) t += '…'
    ctx.fillText(t, pad + 22, ly + i * 22)
  })
  drawCheckBadge(ctx, W / 2 - 55, eTop + bodyH - 52)

  drawFooter(ctx, W, eTop + bodyH, modelCode, '核验通过')
  return cv
}

// ---------- Pick renderer ----------
function pickKind(a: ArtifactLike): 'text' | 'image' | 'binary' {
  if (isImageFile(a.name, a.mimeType)) return 'image'
  if (effectiveText(a).length >= 20) return 'text'
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
      // Try to load actual image
      let img: HTMLImageElement | undefined
      try {
        img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image()
          i.onload = () => res(i); i.onerror = rej
          i.src = a.url!
        })
      } catch { img = undefined }
      out = drawImagePreview(ctx, dpr, a, modelCode, W, img)
    } else if (kind === 'image') {
      out = drawImagePreview(ctx, dpr, a, modelCode, W)
    } else if (kind === 'text') {
      out = drawTextEditor(ctx, dpr, a, effectiveText(a), modelCode, W)
    } else {
      const raw = (a.parsedText || a.textContent || '').trim()
      const note = isPlaceholderText(raw) ? undefined : raw.slice(0, 100)
      out = drawBinaryCard(ctx, dpr, a, modelCode, W, note)
    }
    return {
      name: `verify-${String(idx + 1).padStart(2, '0')}-${a.name.replace(/[^\w.\-]/g, '_').slice(0, 50)}.png`,
      dataUrl: out.toDataURL('image/png'),
    }
  } catch (e) {
    console.error('Failed to render artifact screenshot', a.name, e)
    return null
  }
}

/**
 * Render up to 4 verification screenshots. Always returns at least one image.
 */
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
    // Manifest fallback
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = 1280
      const cv = document.createElement('canvas')
      const ctx = cv.getContext('2d')
      if (ctx) {
        const info = list.map(a => a.name + (a.size ? ' (' + formatSize(a.size) + ')' : ''))
        if (info.length === 0) info.push('(未提交产物)')
        const m = drawManifest(ctx, dpr, modelCode, W, info)
        out.push({ name: `verify-manifest-${modelCode}.png`, dataUrl: m.toDataURL('image/png') })
      }
    } catch (e) { console.error(e) }
  }
  return out
}

/** Sync fallback for callers that cannot await. */
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
      if (kind === 'image') m = drawImagePreview(ctx, dpr, a, modelCode, W)
      else if (kind === 'text') m = drawTextEditor(ctx, dpr, a, effectiveText(a), modelCode, W)
      else {
        const raw = (a.parsedText || a.textContent || '').trim()
        m = drawBinaryCard(ctx, dpr, a, modelCode, W, isPlaceholderText(raw) ? undefined : raw.slice(0, 100))
      }
      out.push({
        name: `verify-${String(i + 1).padStart(2, '0')}-${a.name.replace(/[^\w.\-]/g, '_').slice(0, 50)}.png`,
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
        const info = list.map(a => a.name + (a.size ? ' (' + formatSize(a.size) + ')' : ''))
        if (!info.length) info.push('(未提交产物)')
        const m = drawManifest(ctx, dpr, modelCode, W, info)
        out.push({ name: `verify-manifest-${modelCode}.png`, dataUrl: m.toDataURL('image/png') })
      }
    } catch {}
  }
  return out
}
