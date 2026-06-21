/**
 * 执行轨迹截图（process + dashboard）的数据模型与序列化工具。
 *
 * 与验证截图（verification-evidence）的区别：
 * - 轨迹截图通过 AI 视觉识别自动生成，存 Blob（base64 太大不适合直接存 DB）
 * - 验证截图由测试者手动上传，存 DB 内联 base64（数量少、体积可控）
 *
 * 存储格式（screenshotUrls 字段）：
 *   { version: 1, images: [{ id, name, url, size, type }] }
 *
 * 兼容旧数据：旧版只存 "N images" 文本标记，解析时返回空数组。
 */

export type TrajectoryScreenshotType = 'process' | 'dashboard'

export type TrajectoryScreenshot = {
  id: string
  name: string
  url: string            // Blob URL
  size: number           // 字节数
  type: TrajectoryScreenshotType
  uploadedAt: string
}

type StoredScreenshot = Partial<TrajectoryScreenshot> & {
  id?: unknown
  name?: unknown
  url?: unknown
  size?: unknown
  type?: unknown
  uploadedAt?: unknown
}

type StoredPayload = {
  version?: unknown
  images?: unknown
}

export const TRAJECTORY_SCREENSHOT_VERSION = 1

function isBlobUrl(value: unknown): value is string {
  return typeof value === 'string' &&
    (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('/'))
}

function toScreenshotType(value: unknown): TrajectoryScreenshotType {
  return value === 'dashboard' ? 'dashboard' : 'process'
}

function normalizeScreenshot(value: StoredScreenshot, index: number): TrajectoryScreenshot | null {
  if (typeof value?.name !== 'string' || !isBlobUrl(value.url)) return null

  return {
    id: typeof value.id === 'string' && value.id ? value.id : `legacy-${index}-${value.name}`,
    name: value.name.slice(0, 180),
    url: value.url,
    size: typeof value.size === 'number' && value.size > 0 ? value.size : 0,
    type: toScreenshotType(value.type),
    uploadedAt: typeof value.uploadedAt === 'string' ? value.uploadedAt : new Date(0).toISOString(),
  }
}

/**
 * 从数据库字符串解析轨迹截图数组。
 * 兼容旧版 "N images" 标记（返回空数组）。
 */
export function parseTrajectoryScreenshots(raw?: string | null): TrajectoryScreenshot[] {
  if (!raw) return []
  // 旧数据：纯文本如 "3 images"
  if (!raw.startsWith('{')) return []

  try {
    const parsed = JSON.parse(raw) as StoredPayload
    if (!parsed || !Array.isArray(parsed.images)) return []

    return parsed.images
      .map((image, index) => normalizeScreenshot(image as StoredScreenshot, index))
      .filter((image): image is TrajectoryScreenshot => Boolean(image))
  } catch {
    return []
  }
}

/**
 * 将轨迹截图数组序列化为数据库存储格式。
 */
export function serializeTrajectoryScreenshots(
  screenshots: TrajectoryScreenshot[],
): string {
  return JSON.stringify({ version: TRAJECTORY_SCREENSHOT_VERSION, images: screenshots })
}

/**
 * 按类型筛选截图。
 */
export function filterScreenshotsByType(
  screenshots: TrajectoryScreenshot[],
  type: TrajectoryScreenshotType,
): TrajectoryScreenshot[] {
  return screenshots.filter(s => s.type === type)
}

/**
 * 生成截图签名（用于比对是否变化）。
 * 基于 url + size + name 的快速指纹。
 */
export function trajectoryScreenshotsSignature(raw?: string | null): string {
  const screenshots = parseTrajectoryScreenshots(raw)
  return screenshots
    .map(s => `${s.id}:${s.name}:${s.size}:${s.url}`)
    .sort()
    .join('|')
}
