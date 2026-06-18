// @ts-nocheck
// 文件解析工具 - 支持 PDF / Word / Excel / 文本 / ZIP 等多种格式

import mammoth from 'mammoth'
import ExcelJS from 'exceljs'

// pdf-parse 是 CommonJS 模块，Turbopack ESM 模式下需要特殊处理
import * as pdfParseModule from 'pdf-parse'
const PdfParse = (pdfParseModule as any).default || (pdfParseModule as any)

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()

  // PDF
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const data = await PdfParse(buffer as any)
    return data.text || ''
  }

  // Word
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: buffer as any })
    return result.value || ''
  }

  // Excel
  if (ext === 'xlsx' || ext === 'xls' || mimeType?.includes('spreadsheet')) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    let text = ''
    workbook.eachSheet((sheet) => {
      text += '## Sheet: ' + sheet.name + '\n\n'
      sheet.eachRow((row: any) => {
        const rowText = (row.values as any[])
          .map((v) => (v === null || v === undefined ? '' : String(v)))
          .join(' | ')
        text += rowText + '\n'
      })
      text += '\n'
    })
    return text
  }

  // 纯文本
  if (ext === 'txt' || ext === 'csv' || ext === 'md' || ext === 'json' || mimeType?.startsWith('text/')) {
    return buffer.toString('utf-8')
  }

  return ''
}

export async function parseZip(buffer: Buffer): Promise<{ files: { name: string; text: string }[] }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer as any)
  const files: { name: string; text: string }[] = []

  for (const [name, file] of Object.entries(zip.files)) {
    if ((file as any).dir) continue
    try {
      const fileBuffer = await (file as any).async('nodebuffer')
      const text = await parseFile(fileBuffer, name, '')
      if (text) {
        files.push({ name, text })
      }
    } catch {
      // skip
    }
  }

  return { files }
}
