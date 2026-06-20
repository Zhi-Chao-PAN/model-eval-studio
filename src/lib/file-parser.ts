import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import {
  artifactEntryScore,
  escapePreviewHtml,
  fileExtension,
  inferArtifactPreviewKind,
  isJunkArtifactText,
  sanitizePreviewHtml,
  shouldIgnoreArchiveEntry,
  tableTextHtml,
  textDocumentHtml,
  type StoredArtifactPreview,
} from '@/lib/artifact-preview'

type ZipFileEntry = {
  dir: boolean
  async(type: 'nodebuffer'): Promise<Buffer>
  async(type: 'text'): Promise<string>
}

type PdfParseModule = {
  default?: (buffer: Buffer) => Promise<{ text?: string }>
  PDFParse?: new (options: { data: Buffer }) => {
    getText(): Promise<{ text?: string }>
    destroy(): Promise<void> | void
  }
}

function getExtension(filename: string): string {
  return fileExtension(filename)
}

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'markdown', 'json', 'jsonl', 'log', 'xml', 'html', 'htm', 'yaml', 'yml'])

export function sanitizeParsedText(text: string): string {
  return text.replace(/\u0000/g, '')
}

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/csv' ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml')
  )
}

function isProbablyText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  if (sample.includes(0)) return false

  const decoded = sample.toString('utf-8')
  const replacementChars = decoded.match(/\uFFFD/g)?.length || 0
  return replacementChars <= Math.max(1, Math.floor(decoded.length * 0.01))
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);/gi, (entity) => {
    if (entity === '&amp;') return '&'
    if (entity === '&lt;') return '<'
    if (entity === '&gt;') return '>'
    if (entity === '&quot;') return '"'
    if (entity === '&apos;') return "'"
    if (entity.startsWith('&#x')) return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16))
    if (entity.startsWith('&#')) return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10))
    return entity
  })
}

function extractPptxXmlText(xml: string): string {
  const runs = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g), (match) => decodeXmlEntities(match[1]))
  return sanitizeParsedText(runs.join(' ').replace(/\s+/g, ' ').trim())
}

async function parsePptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const slideEntries = Object.entries(zip.files)
    .filter(([name, file]) => !file.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(([a], [b]) => {
      const slideA = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0)
      const slideB = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0)
      return slideA - slideB
    }) as [string, ZipFileEntry][]

  const slides: string[] = []
  for (const [name, file] of slideEntries) {
    const slideNumber = name.match(/slide(\d+)\.xml/i)?.[1] || String(slides.length + 1)
    const text = extractPptxXmlText(await file.async('text'))
    if (text) slides.push('## Slide ' + slideNumber + '\n' + text)
  }

  return slides.join('\n\n')
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import('pdf-parse') as unknown as PdfParseModule

  if (typeof pdfParseModule.default === 'function') {
    const result = await pdfParseModule.default(buffer)
    return sanitizeParsedText(result?.text || '')
  }

  if (pdfParseModule.PDFParse) {
    const Parser = pdfParseModule.PDFParse
    const parser = new Parser({ data: buffer })
    try {
      const result = await parser.getText()
      return sanitizeParsedText(result.text || '')
    } finally {
      await parser.destroy()
    }
  }

  throw new Error('PDF parser is unavailable in this runtime')
}

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const ext = getExtension(filename)

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return parsePdf(buffer)
  }

  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return sanitizeParsedText(result.value || '')
  }

  if (ext === 'xlsx' || ext === 'xls' || mimeType?.includes('spreadsheet')) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    let text = ''

    workbook.eachSheet((sheet) => {
      text += '## Sheet: ' + sheet.name + '\n\n'
      sheet.eachRow((row) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : []
        const rowText = values
          .map((value) => (value === null || value === undefined ? '' : String(value)))
          .join(' | ')
        text += rowText + '\n'
      })
      text += '\n'
    })

    return sanitizeParsedText(text.trim())
  }

  if (ext === 'pptx' || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return parsePptx(buffer)
  }

  if (TEXT_EXTENSIONS.has(ext) || isTextMimeType(mimeType)) {
    return sanitizeParsedText(buffer.toString('utf-8'))
  }

  if (isProbablyText(buffer)) {
    return sanitizeParsedText(buffer.toString('utf-8'))
  }

  return ''
}

export async function buildFilePreview(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  parsedText?: string,
): Promise<StoredArtifactPreview | null> {
  const ext = getExtension(filename)
  const kind = inferArtifactPreviewKind(filename)
  const text = parsedText ?? await parseFile(buffer, filename, mimeType)
  let html = ''
  let renderMode: StoredArtifactPreview['renderMode'] = 'plain-text'

  if (ext === 'docx') {
    const converted = await mammoth.convertToHtml({ buffer })
    html = sanitizePreviewHtml(converted.value || '')
    renderMode = 'converted-document'
  } else if (kind === 'table') {
    html = tableTextHtml(text)
    renderMode = 'structured-table'
  } else if (kind === 'html') {
    html = sanitizePreviewHtml(text)
    renderMode = 'sanitized-html'
  } else if (kind === 'document') {
    html = textDocumentHtml(text)
    renderMode = 'converted-document'
  } else if (kind === 'code' || kind === 'text') {
    html = `<pre>${escapePreviewHtml(text.slice(0, 90_000))}</pre>`
  }

  if (!text.trim() && !html.trim()) return null
  return {
    version: 1,
    source: 'file',
    sourceName: filename,
    primaryName: filename,
    primaryKind: kind,
    renderMode,
    html,
    text,
  }
}

const MAX_ARCHIVE_FILES = 200
const MAX_ARCHIVE_ENTRY_BYTES = 15 * 1024 * 1024
const MAX_ARCHIVE_TOTAL_BYTES = 60 * 1024 * 1024

export async function parseZip(buffer: Buffer): Promise<{
  files: { name: string; text: string }[]
  preview: StoredArtifactPreview | null
}> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const files: Array<{ name: string; text: string; buffer: Buffer; score: number }> = []
  let totalBytes = 0

  for (const [name, file] of Object.entries(zip.files) as [string, ZipFileEntry][]) {
    if (file.dir || shouldIgnoreArchiveEntry(name) || files.length >= MAX_ARCHIVE_FILES) continue
    try {
      const fileBuffer = await file.async('nodebuffer')
      if (fileBuffer.length > MAX_ARCHIVE_ENTRY_BYTES) continue
      totalBytes += fileBuffer.length
      if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) break
      const text = await parseFile(fileBuffer, name, '')
      if (!text.trim() || isJunkArtifactText(text)) continue
      files.push({
        name,
        text,
        buffer: fileBuffer,
        score: artifactEntryScore(name, inferArtifactPreviewKind(name), text),
      })
    } catch {
      // Keep ZIP imports resilient: one unsupported file should not reject the whole archive.
    }
  }

  const primary = [...files].sort((a, b) => b.score - a.score)[0]
  let preview: StoredArtifactPreview | null = null
  if (primary) {
    const filePreview = await buildFilePreview(primary.buffer, primary.name, '', primary.text)
    if (filePreview) {
      preview = {
        ...filePreview,
        source: 'archive',
        sourceName: 'ZIP archive',
        entries: files
          .sort((a, b) => b.score - a.score)
          .slice(0, 80)
          .map(item => ({ name: item.name, kind: inferArtifactPreviewKind(item.name) })),
      }
    }
  }

  return {
    files: files.map(({ name, text }) => ({ name, text })),
    preview,
  }
}
