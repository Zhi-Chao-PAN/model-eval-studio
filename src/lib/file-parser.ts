import ExcelJS from 'exceljs'
import mammoth from 'mammoth'

type ZipFileEntry = {
  dir: boolean
  async(type: 'nodebuffer'): Promise<Buffer>
}

type PdfParseModule = {
  default?: (buffer: Buffer) => Promise<{ text?: string }>
  PDFParse?: new (options: { data: Buffer }) => {
    getText(): Promise<{ text?: string }>
    destroy(): Promise<void> | void
  }
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import('pdf-parse') as unknown as PdfParseModule

  if (typeof pdfParseModule.default === 'function') {
    const result = await pdfParseModule.default(buffer)
    return result?.text || ''
  }

  if (pdfParseModule.PDFParse) {
    const Parser = pdfParseModule.PDFParse
    const parser = new Parser({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text || ''
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
    return result.value || ''
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

    return text.trim()
  }

  return buffer.toString('utf-8')
}

export async function parseZip(buffer: Buffer): Promise<{ files: { name: string; text: string }[] }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const files: { name: string; text: string }[] = []

  for (const [name, file] of Object.entries(zip.files) as [string, ZipFileEntry][]) {
    if (file.dir) continue
    try {
      const fileBuffer = await file.async('nodebuffer')
      const text = await parseFile(fileBuffer, name, '')
      if (text) files.push({ name, text })
    } catch {
      // Keep ZIP imports resilient: one unsupported file should not reject the whole archive.
    }
  }

  return { files }
}
