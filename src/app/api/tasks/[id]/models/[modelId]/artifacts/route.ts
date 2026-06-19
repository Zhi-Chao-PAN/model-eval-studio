import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { parseFile, parseZip } from '@/lib/file-parser'

export const runtime = 'nodejs'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
      const textContent = String(body.textContent || '')
      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name: body.name || '文本内容.txt',
          url: body.url || '',
          textContent: textContent || null,
          mimeType: body.mimeType || null,
          size: body.size || null,
          parsedText: body.parsedText || textContent || null,
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

      try {
        if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
          const zipResult = await parseZip(buffer)
          parsedText = zipResult.files.map((entry) => `=== ${entry.name} ===\n${entry.text}`).join('\n\n')
        } else {
          parsedText = await parseFile(buffer, file.name, file.type)
        }
      } catch (error: unknown) {
        const message = errorMessage(error)
        console.error('文件解析失败:', file.name, message)
        parsedText = '[文件解析失败: ' + (message || '未知错误') + ']'
      }

      const artifact = await prisma.modelArtifact.create({
        data: {
          taskModelId: modelId,
          name: file.name,
          url: '',
          mimeType: file.type || null,
          size: file.size,
          textContent: '',
          parsedText: parsedText || '[无法解析该文件格式]',
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
