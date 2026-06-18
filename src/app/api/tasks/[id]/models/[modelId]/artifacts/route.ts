import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { parseFile, parseZip } from '@/lib/file-parser'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { id, modelId } = await params

  const model = await prisma.taskModel.findFirst({
    where: { id: modelId, task: { userId: session.userId, id } },
  })
  if (!model) return NextResponse.json({ error: '模型不存在' }, { status: 404 })

  const contentType = request.headers.get('content-type') || ''

  // JSON body - 文本粘贴方式（兼容旧版）
  if (contentType.includes('application/json')) {
    const { name, url, textContent, mimeType, size, parsedText } = await request.json()
    const artifact = await prisma.modelArtifact.create({
      data: {
        taskModelId: modelId,
        name: name || 'untitled',
        url: url || '',
        textContent: textContent || null,
        mimeType: mimeType || null,
        size: size || null,
        parsedText: parsedText || textContent || null,
      },
    })
    return NextResponse.json({ artifact })
  }

  // Multipart form - 文件上传方式
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: '不支持的 Content-Type' }, { status: 400 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]

  if (files.length === 0) {
    return NextResponse.json({ error: '请上传文件' }, { status: 400 })
  }

  const created = []

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    let parsedText = ''

    try {
      // ZIP 文件特殊处理：解压后解析所有文本文件
      if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
        const zipResult = await parseZip(buffer)
        parsedText = zipResult.files.map((f) => `=== ${f.name} ===\n${f.text}`).join('\n\n');
      } else {
        parsedText = await parseFile(buffer, file.name, file.type)
      }
    } catch (e: any) {
      console.error('文件解析失败:', file.name, e.message)
      parsedText = '[文件解析失败: ' + (e.message || '未知错误') + ']'
    }

    const artifact = await prisma.modelArtifact.create({
      data: {
        taskModelId: modelId,
        name: file.name,
        url: '', // 本地部署暂不存储原始文件，只存解析后的文本
        mimeType: file.type || null,
        size: file.size,
        textContent: '', // 原始文本内容（如果是纯文本）
        parsedText: parsedText || '[无法解析该文件格式]',
      },
    })
    created.push(artifact)
  }

  return NextResponse.json({ artifacts: created })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const { modelId } = await params
  const body = await request.json()
  const artifactId = body.artifactId

  const artifact = await prisma.modelArtifact.findFirst({
    where: { id: artifactId, taskModel: { id: modelId, task: { userId: session.userId } } },
  })
  if (!artifact) return NextResponse.json({ error: '文件不存在' }, { status: 404 })

  await prisma.modelArtifact.delete({ where: { id: artifactId } })
  return NextResponse.json({ ok: true })
}