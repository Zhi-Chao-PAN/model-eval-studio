import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { buildFilePreview, parseFile, parseZip, sanitizeParsedText } from '@/lib/file-parser'
import { deleteArtifactFile, storeArtifactFile } from '@/lib/artifact-storage'
import { logAudit } from '@/lib/audit'
import { getTaskAccess, requireAccess } from '@/lib/task-access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { safeServerError } from '@/lib/api-error'
import { sanitizeFileName, validateFileName, validateMimeType } from '@/lib/file-validation'

export const runtime = 'nodejs'

const MAX_FILES_PER_UPLOAD = 10
const MAX_SINGLE_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_UPLOAD_BYTES = 60 * 1024 * 1024
const MAX_STORED_TEXT_CHARS = 240_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function dbText(value: unknown): string {
  return sanitizeParsedText(String(value || '')).slice(0, MAX_STORED_TEXT_CHARS)
}

function fileName(value: unknown, fallback: string): string {
  return sanitizeFileName(value, fallback)
}

async function requireModel(taskId: string, modelId: string) {
  return prisma.taskModel.findFirst({
    where: { id: modelId, taskId },
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  let userId: string | null = null
  let taskId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let artifactCount = 0
  let modelCode = ''
  const storedUrls: string[] = []

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    userId = session.userId

    const rateLimit = await consumeRateLimit({
      scope: 'artifact-upload',
      identifier: session.userId,
      limit: 30,
      windowMs: 60 * 60_000,
    })
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit)

    const { id, modelId } = await params
    taskId = id

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const model = await requireModel(id, modelId)
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })
    modelCode = model.modelCode

    // Defense-in-depth: reject oversized requests at the header level before
    // streaming/parsing the multipart body. The per-file limits below still
    // apply as a second layer.
    const contentLengthHeader = request.headers.get('content-length')
    if (contentLengthHeader) {
      const declaredLen = Number(contentLengthHeader)
      if (Number.isFinite(declaredLen) && declaredLen > MAX_TOTAL_UPLOAD_BYTES + 1024 * 1024) {
        // Allow 1MB of multipart overhead (boundaries, headers per part)
        errorMsg = `请求体过大，单次上传总大小不能超过 ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB`
        return NextResponse.json({ error: errorMsg }, { status: 413 })
      }
    }

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        errorMsg = '请求内容格式无效'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      const textContent = dbText((body as Record<string, unknown>).textContent)
      if (!textContent.trim()) {
        errorMsg = '文本内容不能为空'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      const parsedText = dbText((body as Record<string, unknown>).parsedText || textContent)
      const rawName = typeof (body as Record<string, unknown>).name === 'string' ? (body as Record<string, unknown>).name as string : '文本内容.txt'
      const name = sanitizeFileName(rawName, '文本内容.txt')
      const nameErr = validateFileName(name)
      if (nameErr) {
        errorMsg = nameErr
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      let mimeType = 'text/plain'
      if (typeof body.mimeType === 'string' && body.mimeType.trim()) {
        const mtErr = validateMimeType(body.mimeType)
        if (mtErr) {
          errorMsg = mtErr
          return NextResponse.json({ error: errorMsg }, { status: 400 })
        }
        mimeType = body.mimeType.trim().toLowerCase()
      }
      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name,
          url: '',
          textContent: textContent || null,
          mimeType,
          size: Buffer.byteLength(textContent, 'utf8'),
          parsedText: parsedText || null,
        },
      })
      artifactCount = 1
      status = 'success'
      return NextResponse.json({ artifact })
    }

    if (!contentType.includes('multipart/form-data')) {
      errorMsg = '不支持的 Content-Type'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)

    if (files.length === 0) {
      errorMsg = '请上传文件'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      errorMsg = `一次最多上传 ${MAX_FILES_PER_UPLOAD} 个文件`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_UPLOAD_BYTES) {
      errorMsg = `单次上传总大小不能超过 ${Math.round(MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024)}MB`
      return NextResponse.json({ error: errorMsg }, { status: 413 })
    }
    const oversized = files.find(file => file.size <= 0 || file.size > MAX_SINGLE_UPLOAD_BYTES)
    if (oversized) {
      errorMsg = `${oversized.name || '文件'} 大小不合法，单个文件需在 1B-${Math.round(MAX_SINGLE_UPLOAD_BYTES / 1024 / 1024)}MB 内`
      return NextResponse.json({ error: errorMsg }, { status: 413 })
    }

    // Validate filenames and MIME types BEFORE doing any storage/parsing work
    for (const file of files) {
      const safeName = sanitizeFileName(file.name, 'uploaded-file')
      const nameErr = validateFileName(safeName)
      if (nameErr) {
        errorMsg = `${file.name || '文件'}: ${nameErr}`
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      if (file.type) {
        const mtErr = validateMimeType(file.type)
        if (mtErr) {
          errorMsg = `${file.name || '文件'}: ${mtErr}`
          return NextResponse.json({ error: errorMsg }, { status: 400 })
        }
      }
    }

    // Phase 1: 全部存入 blob 并解析内容（不写 DB）
    type PreparedArtifact = {
      name: string
      url: string
      mimeType: string
      size: number
      textContent: string
      parsedText: string
      previewJson: string | null
    }
    const prepared: PreparedArtifact[] = []

    for (const file of files) {
      const safeName = sanitizeFileName(file.name, 'uploaded-file')
      const declaredMime = (file.type || '').trim()
      const buffer = Buffer.from(await file.arrayBuffer())
      const stored = await storeArtifactFile({
        buffer,
        fileName: safeName,
        contentType: declaredMime || 'application/octet-stream',
        userId: session.userId,
        taskId: id,
        modelId,
      })
      storedUrls.push(stored.url)

      let parsedText = ''
      let previewJson: string | null = null
      // Detect images using sanitized name + declared MIME
      const image = declaredMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(safeName)

      if (image) {
        parsedText = '[图片文件已保存，请下载到本地打开验收后上传产物效果截图]'
      }

      const isZip = /\.zip$/i.test(safeName)
        || declaredMime === 'application/zip'
        || declaredMime === 'application/x-zip-compressed'
      try {
        if (isZip) {
          const zipResult = await parseZip(buffer)
          parsedText = parsedText || zipResult.files.map((entry) => `=== ${entry.name} ===\n${entry.text}`).join('\n\n')
          if (zipResult.preview) {
            zipResult.preview.sourceName = safeName
            previewJson = JSON.stringify(zipResult.preview)
          }
        } else if (!image) {
          parsedText = await parseFile(buffer, safeName, declaredMime)
          const preview = await buildFilePreview(buffer, safeName, declaredMime, parsedText)
          if (preview) previewJson = JSON.stringify(preview)
        }
      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error('文件解析失败:', safeName, message)
        if (!parsedText) parsedText = '[文件解析失败: ' + (message || '未知错误') + ']'
      }

      const safeParsedText = dbText(parsedText)
      prepared.push({
        name: safeName,
        url: stored.url,
        mimeType: declaredMime || stored.contentType || 'application/octet-stream',
        size: stored.size,
        textContent: '',
        parsedText: safeParsedText || '[无法解析该文件格式，但原文件已保存，可下载验收]',
        previewJson,
      })
    }

    // Phase 2: 所有文件存好后，事务写入 DB
    // 如果 DB 写入失败，事务整体回滚，catch 块清理所有 blob 文件
    const created = await prisma.$transaction(
      prepared.map((p) =>
        prisma.modelArtifact.create({
          data: {
            taskModelId: modelId,
            name: p.name,
            url: p.url,
            mimeType: p.mimeType,
            size: p.size,
            textContent: p.textContent,
            parsedText: p.parsedText,
            previewJson: p.previewJson,
          },
        }),
      ),
    )

    artifactCount = created.length
    status = 'success'
    return NextResponse.json({ artifacts: created })
  } catch (error: unknown) {
    const { message } = safeServerError(error, 'ARTIFACT_UPLOAD')
    errorMsg = message
    await Promise.all(storedUrls.map(url => deleteArtifactFile(url).catch(() => undefined)))
    return NextResponse.json({ error: '产物保存失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'ARTIFACT_UPLOAD',
      userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { artifactCount, modelCode },
    })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const startedAt = Date.now()
  let userId: string | null = null
  let taskId: string | null = null
  let status: 'success' | 'error' = 'error'
  let errorMsg: string | null = null
  let artifactName = ''

  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    userId = session.userId

    // Rate limit artifact deletion
    const rl = await consumeRateLimit({
      scope: 'artifact-delete',
      identifier: session.userId,
      limit: 60,
      windowMs: 10 * 60_000,
    })
    if (!rl.allowed) return rateLimitResponse(rl)

    const { id, modelId } = await params
    taskId = id
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      errorMsg = '请求内容格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const artifactId = typeof (body as Record<string, unknown>).artifactId === 'string'
      ? (body as Record<string, unknown>).artifactId as string
      : ''
    if (!artifactId || !/^[a-z0-9]{20,32}$/.test(artifactId)) {
      errorMsg = 'artifactId 格式无效'
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { access } = await getTaskAccess(id, session)
    const denied = requireAccess(access, 'EDITOR')
    if (denied) {
      errorMsg = denied.error
      return NextResponse.json({ error: denied.error }, { status: denied.status })
    }

    const model = await requireModel(id, modelId)
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    const artifact = await prisma.modelArtifact.findFirst({
      where: { id: artifactId, taskModelId: modelId },
    })
    if (!artifact) {
      errorMsg = '文件不存在'
      return NextResponse.json({ error: errorMsg }, { status: 404 })
    }
    artifactName = artifact.name

    await prisma.$transaction([
      prisma.modelArtifact.delete({ where: { id: artifactId } }),
      prisma.taskModel.update({ where: { id: modelId }, data: { artifactAnalysisJson: null } }),
    ])
    await deleteArtifactFile(artifact.url).catch((error) => {
      console.warn('删除产物原文件失败:', errorMessage(error))
    })
    status = 'success'
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const { message } = safeServerError(error, 'ARTIFACT_DELETE')
    errorMsg = message
    return NextResponse.json({ error: '产物删除失败：' + message }, { status: 500 })
  } finally {
    logAudit(request, {
      action: 'ARTIFACT_DELETE',
      userId,
      taskId,
      status,
      error: errorMsg,
      durationMs: Date.now() - startedAt,
      detail: { artifactName },
    })
  }
}
