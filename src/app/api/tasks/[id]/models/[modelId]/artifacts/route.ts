import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { parseFile, parseZip, sanitizeParsedText } from '@/lib/file-parser'

export const runtime = 'nodejs'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function dbText(value: unknown): string {
  return sanitizeParsedText(String(value || ''))
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
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const { id, modelId } = await params
    const model = await requireOwnedModel(session.userId, id, modelId)
    if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      const textContent = dbText(body.textContent)
      const parsedText = dbText(body.parsedText || textContent)
      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name: body.name || '文本内容.txt',
          url: body.url || '',
          textContent: textContent || null,
          mimeType: body.mimeType || null,
          size: body.size || null,
          parsedText: parsedText || null,
        },
      })
      return NextResponse.json({ artifact })
    }

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: '不支持的 Content-Type' }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 })
    }

    const created = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      let parsedText = ''
      let urlValue = ''

      // For image files, store a data URL so the client can render the actual
      // image in verification screenshots. Cap at 4 MB to avoid DB bloat.
      const isImage = file.type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)
      if (isImage && file.size <= 4 * 1024 * 1024) {
        const mime = file.type || 'application/octet-stream'
        urlValue = `data:${mime};base64,${buffer.toString('base64')}`
      } else if (isImage) {
        parsedText = '[图片文件过大(' + (file.size / 1024 / 1024).toFixed(1) + 'MB)，未内嵌预览]'
      }

      try {
        if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
          const zipResult = await parseZip(buffer)
          parsedText = parsedText || zipResult.files.map((entry) => `=== ${entry.name} ===\n${entry.text}`).join('\n\n')
        } else if (!isImage) {
          parsedText = await parseFile(buffer, file.name, file.type)
        }
      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error('文件解析失败:', file.name, message)
        if (!parsedText) parsedText = '[文件解析失败: ' + (message || '未知错误') + ']'
      }

      const safeParsedText = dbText(parsedText)
      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name: file.name,
          url: urlValue,
          mimeType: file.type || null,
          size: file.size,
          textContent: '',
          parsedText: safeParsedText || '[无法解析该文件格式]',
        },
      })
      created.push(artifact)
    }

    return NextResponse.json({ artifacts: created })
  } catch (error: unknown) {
    console.error('Artifact save failed:', error)
    return NextResponse.json({ error: '产物保存失败：' + errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  try {
    const session = await requireAuth()
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const { id, modelId } = await params
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
    if (!artifact) return NextResponse.json({ error: '文件不存在' }, { status: 404 })

    await prisma.modelArtifact.delete({ where: { id: artifactId } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    console.error('Artifact delete failed:', error)
    return NextResponse.json({ error: '产物删除失败：' + errorMessage(error) }, { status: 500 })
  }
}
