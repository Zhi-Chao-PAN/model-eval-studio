import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { del, get, put } from '@vercel/blob'

const LOCAL_PREFIX = 'local-artifact://'
const LOCAL_STORAGE_ROOT = path.join(process.cwd(), '.local-artifacts')

export type StoredArtifactFile = {
  url: string
  contentType: string
  size: number
}

function safeSegment(value: string): string {
  const normalized = value.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized.slice(0, 100) || 'file'
}

function blobStorageAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL && process.env.BLOB_STORE_ID),
  )
}

function localPathFromUrl(url: string): string {
  const key = url.slice(LOCAL_PREFIX.length)
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, key)
  const root = path.resolve(LOCAL_STORAGE_ROOT) + path.sep
  if (!resolved.startsWith(root)) throw new Error('非法的本地产物路径')
  return resolved
}

export async function storeArtifactFile(input: {
  buffer: Buffer
  fileName: string
  contentType?: string | null
  userId: string
  taskId: string
  modelId: string
}): Promise<StoredArtifactFile> {
  const contentType = input.contentType || 'application/octet-stream'
  const pathname = [
    'model-eval-artifacts',
    safeSegment(input.userId),
    safeSegment(input.taskId),
    safeSegment(input.modelId),
    `${crypto.randomUUID()}-${safeSegment(input.fileName)}`,
  ].join('/')

  if (blobStorageAvailable()) {
    const blob = await put(pathname, input.buffer, {
      access: 'private',
      addRandomSuffix: false,
      contentType,
      multipart: input.buffer.length >= 5 * 1024 * 1024,
    })
    return { url: blob.url, contentType, size: input.buffer.length }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境未配置私有文件存储，请设置 BLOB_READ_WRITE_TOKEN')
  }

  const filePath = path.join(LOCAL_STORAGE_ROOT, pathname)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, input.buffer)
  return { url: LOCAL_PREFIX + pathname.replace(/\\/g, '/'), contentType, size: input.buffer.length }
}

export async function readArtifactFile(url: string): Promise<StoredArtifactFile & { body: BodyInit }> {
  if (url.startsWith(LOCAL_PREFIX)) {
    const buffer = await readFile(localPathFromUrl(url))
    return { url, body: new Uint8Array(buffer), contentType: 'application/octet-stream', size: buffer.length }
  }

  const result = await get(url, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) throw new Error('产物文件不存在或暂时不可读取')
  return {
    url,
    body: result.stream,
    contentType: result.blob.contentType || 'application/octet-stream',
    size: result.blob.size,
  }
}

export async function deleteArtifactFile(url?: string | null): Promise<void> {
  if (!url) return
  if (url.startsWith(LOCAL_PREFIX)) {
    await rm(localPathFromUrl(url), { force: true })
    return
  }
  if (url.startsWith('https://')) await del(url)
}

export function hasStoredArtifactFile(url?: string | null): boolean {
  return Boolean(url && (url.startsWith(LOCAL_PREFIX) || url.startsWith('https://')))
}
