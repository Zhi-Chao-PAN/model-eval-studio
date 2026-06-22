import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { hasStoredArtifactFile, readArtifactFile } from '@/lib/artifact-storage'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { safeServerError } from '@/lib/api-error'
import { isValidCuid } from '@/lib/utils'

export const runtime = 'nodejs'

// MIME types that can carry active content (HTML, SVG with <script>, etc.)
// When serving these as downloads, force application/octet-stream to prevent
// any browser from rendering them inline, even if Content-Disposition is
// mishandled by a proxy or older browser.
const DANGEROUS_INLINE_MIME_PREFIXES = [
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
]

function safeAsciiFilename(name: string): string {
  return name
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 120) || 'artifact'
}

function contentDisposition(name: string): string {
  return `attachment; filename="${safeAsciiFilename(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Harden declared MIME type for download responses.
 *  - forces octet-stream for active-content types that could execute scripts
 *  - defaults to octet-stream on empty / malformed values
 *  - never returns text/html or image/svg+xml
 */
function safeDownloadContentType(rawMime: string | null | undefined): string {
  if (!rawMime || typeof rawMime !== 'string') return 'application/octet-stream'
  const lower = rawMime.trim().toLowerCase()
  if (!lower || /[\x00-\x1f]/.test(lower)) return 'application/octet-stream'
  for (const prefix of DANGEROUS_INLINE_MIME_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix + ';')) {
      return 'application/octet-stream'
    }
  }
  return lower
}

function dataUrlToBody(dataUrl: string): { body: BodyInit; contentType: string; size: number } | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/)
  if (!match) return null
  const contentType = match[1] || 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const data = isBase64 ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
  return { body: new Uint8Array(data), contentType, size: data.length }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; modelId: string; artifactId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return Response.json({ error: '未登录' }, { status: 401 })

    const { id, modelId, artifactId } = await params
    if (!isValidCuid(id) || !isValidCuid(modelId) || !isValidCuid(artifactId)) {
      return new Response('参数格式无效', { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'VIEWER')
    if (denied) return Response.json({ error: denied.error }, { status: denied.status })

    const model = await prisma.taskModel.findFirst({
      where: { id: modelId, taskId: id },
      select: { id: true },
    })
    if (!model) return Response.json({ error: '模型不存在' }, { status: 404 })

    const artifact = await prisma.modelArtifact.findFirst({
      where: { id: artifactId, taskModelId: modelId },
    })
    if (!artifact) return Response.json({ error: '文件不存在' }, { status: 404 })

    let body: BodyInit
    let declaredContentType: string | null = artifact.mimeType
    let size: number | null = artifact.size

    if (hasStoredArtifactFile(artifact.url)) {
      const stored = await readArtifactFile(artifact.url)
      body = stored.body
      declaredContentType = artifact.mimeType || stored.contentType
      size = stored.size
    } else if (artifact.url?.startsWith('data:')) {
      const parsed = dataUrlToBody(artifact.url)
      if (!parsed) return Response.json({ error: '历史产物数据已损坏' }, { status: 410 })
      body = parsed.body
      declaredContentType = artifact.mimeType || parsed.contentType
      size = parsed.size
    } else {
      const text = artifact.textContent || artifact.parsedText || ''
      if (!text.trim()) return Response.json({ error: '该产物没有可下载的原文件' }, { status: 404 })
      body = text
      declaredContentType = artifact.mimeType || 'text/plain; charset=utf-8'
      size = Buffer.byteLength(text, 'utf8')
    }

    const contentType = safeDownloadContentType(declaredContentType)

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition(artifact.name),
        'Content-Length': size != null ? String(size) : '',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'none'; style-src 'none'; sandbox",
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (err) {
    const { message } = safeServerError(err, 'artifact-download')
    return Response.json({ error: message }, { status: 500 })
  }
}
