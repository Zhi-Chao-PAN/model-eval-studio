import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { hasStoredArtifactFile, readArtifactFile } from '@/lib/artifact-storage'
import { getTaskAccess, requireAccess } from '@/lib/task-access'

export const runtime = 'nodejs'

function safeAsciiFilename(name: string): string {
  return name
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 120) || 'artifact'
}

function contentDisposition(name: string): string {
  return `attachment; filename="${safeAsciiFilename(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`
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
  const session = await requireAuth()
  if (!session) return Response.json({ error: '未登录' }, { status: 401 })

  const { id, modelId, artifactId } = await params

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
  let contentType = artifact.mimeType || 'application/octet-stream'
  let size = artifact.size || null

  if (hasStoredArtifactFile(artifact.url)) {
    const stored = await readArtifactFile(artifact.url)
    body = stored.body
    contentType = artifact.mimeType || stored.contentType
    size = stored.size
  } else if (artifact.url?.startsWith('data:')) {
    const parsed = dataUrlToBody(artifact.url)
    if (!parsed) return Response.json({ error: '历史产物数据已损坏' }, { status: 410 })
    body = parsed.body
    contentType = artifact.mimeType || parsed.contentType
    size = parsed.size
  } else {
    const text = artifact.textContent || artifact.parsedText || ''
    if (!text.trim()) return Response.json({ error: '该产物没有可下载的原文件' }, { status: 404 })
    body = text
    contentType = artifact.mimeType || 'text/plain; charset=utf-8'
    size = Buffer.byteLength(text, 'utf8')
  }

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition(artifact.name),
      'Content-Length': size ? String(size) : '',
      'Cache-Control': 'private, no-store',
    },
  })
}
