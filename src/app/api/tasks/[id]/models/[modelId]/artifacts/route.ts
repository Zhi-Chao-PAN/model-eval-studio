import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { buildFilePreview, parseFile, parseZip, sanitizeParsedText } from '@/lib/file-parser'
import { deleteArtifactFile, storeArtifactFile } from '@/lib/artifact-storage'
import { logAudit } from '@/lib/audit'

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
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim().replace(/[\\/]+/g, '-')
  return trimmed.slice(0, 180) || fallback
}

function isImageFile(file: File): boolean {
  return file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)
}

async function requireOwnedModel(userId: string, taskId: string, modelId: string) {
  return prisma.taskModel.findFirst({
    where: {
      id: modelId,
      task: { userId, id: taskId, status: { not: 'DELETED' } },
    },
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

    const { id, modelId } = await params
    taskId = id
    const model = await requireOwnedModel(session.userId, id, modelId)
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })
    modelCode = model.modelCode

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      const textContent = dbText(body.textContent)
      if (!textContent.trim()) {
        errorMsg = '文本内容不能为空'
        return NextResponse.json({ error: errorMsg }, { status: 400 })
      }
      const parsedText = dbText(body.parsedText || textContent)
      const name = fileName(body.name, '文本内容.txt')
      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name,
          url: '',
          textContent: textContent || null,
          mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'text/plain',
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
      const buffer = Buffer.from(await file.arrayBuffer())
      const stored = await storeArtifactFile({
        buffer,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        userId: session.userId,
        taskId: id,
        modelId,
      })
      storedUrls.push(stored.url)

      let parsedText = ''
      let previewJson: string | null = null
      const image = isImageFile(file)

      if (image) {
        parsedText = '[图片文件已保存，请下载到本地打开验收后上传产物效果截图]'
      }

      try {
        if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
          const zipResult = await parseZip(buffer)
          parsedText = parsedText || zipResult.files.map((entry) => `=== ${entry.name} ===\n${entry.text}`).join('\n\n')
          if (zipResult.preview) {
            zipResult.preview.sourceName = file.name
            previewJson = JSON.stringify(zipResult.preview)
          }
        } else if (!image) {
          parsedText = await parseFile(buffer, file.name, file.type)
          const preview = await buildFilePreview(buffer, file.name, file.type, parsedText)
          if (preview) previewJson = JSON.stringify(preview)
        }
      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error('文件解析失败:', file.name, message)
        if (!parsedText) parsedText = '[文件解析失败: ' + (message || '未知错误') + ']'
      }

      const safeParsedText = dbText(parsedText)
      prepared.push({
        name: file.name,
        url: stored.url,
        mimeType: file.type || stored.contentType,
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
    errorMsg = errorMessage(error)
    await Promise.all(storedUrls.map(url => deleteArtifactFile(url).catch(() => undefined)))
    console.error('Artifact save failed:', error)
    return NextResponse.json({ error: '产物保存失败：' + errorMsg }, { status: 500 })
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

    const { id, modelId } = await params
    taskId = id
    const body = await request.json()
    const artifactId = body.artifactId

    const artifact = await prisma.modelArtifact.findFirst({
      where: {
        id: artifactId,
        taskModel: {
          id: modelId,
          task: { userId: session.userId, id, status: { not: 'DELETED' } },
        },
      },
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
    errorMsg = errorMessage(error)
    console.error('Artifact delete failed:', error)
    return NextResponse.json({ error: '产物删除失败：' + errorMsg }, { status: 500 })
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
