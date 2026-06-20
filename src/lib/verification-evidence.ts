export const MAX_VERIFICATION_EVIDENCE = 4
export const MAX_VERIFICATION_IMAGE_DATA_URL_LENGTH = 1_400_000

export type VerificationEvidenceSource =
  | 'tester_upload'
  | 'screen_capture'
  | 'backend_capture'
  | 'sandbox_auto'
  | 'legacy_auto'

export type VerificationEvidence = {
  id: string
  name: string
  dataUrl: string
  source: VerificationEvidenceSource
  artifactId?: string
  artifactName?: string
  capturedAt?: string
  runner?: string
  verificationUrl?: string
  runLog?: string
  renderMode?: string
  primaryArtifactName?: string
}

type StoredEvidence = Partial<VerificationEvidence> & {
  name?: unknown
  dataUrl?: unknown
  source?: unknown
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/')
}

function toSource(value: unknown): VerificationEvidenceSource {
  return value === 'tester_upload' ||
    value === 'screen_capture' ||
    value === 'backend_capture' ||
    value === 'sandbox_auto'
    ? value
    : 'legacy_auto'
}

function normalizeEvidence(value: StoredEvidence, index: number): VerificationEvidence | null {
  if (typeof value?.name !== 'string' || !isImageDataUrl(value.dataUrl)) return null

  return {
    id: typeof value.id === 'string' && value.id ? value.id : `legacy-${index}-${value.name}`,
    name: value.name.slice(0, 180),
    dataUrl: value.dataUrl,
    source: toSource(value.source),
    artifactId: typeof value.artifactId === 'string' ? value.artifactId : undefined,
    artifactName: typeof value.artifactName === 'string' ? value.artifactName : undefined,
    capturedAt: typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
    runner: typeof value.runner === 'string' ? value.runner.slice(0, 120) : undefined,
    verificationUrl: typeof value.verificationUrl === 'string' ? value.verificationUrl.slice(0, 500) : undefined,
    runLog: typeof value.runLog === 'string' ? value.runLog.slice(0, 2000) : undefined,
    renderMode: typeof value.renderMode === 'string' ? value.renderMode.slice(0, 80) : undefined,
    primaryArtifactName: typeof value.primaryArtifactName === 'string' ? value.primaryArtifactName.slice(0, 240) : undefined,
  }
}

export function parseVerificationEvidence(raw?: string | null): VerificationEvidence[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as StoredEvidence[] | { images?: StoredEvidence[] }
    const images = Array.isArray(parsed) ? parsed : parsed?.images
    if (!Array.isArray(images)) return []

    return images
      .map((image, index) => normalizeEvidence(image, index))
      .filter((image): image is VerificationEvidence => Boolean(image))
  } catch {
    return []
  }
}

export function isAuthenticVerificationEvidence(evidence: VerificationEvidence): boolean {
  return (
    evidence.source === 'tester_upload' ||
    evidence.source === 'screen_capture' ||
    evidence.source === 'backend_capture' ||
    evidence.source === 'sandbox_auto'
  )
}

export function serializeVerificationEvidence(evidence: VerificationEvidence[]): string {
  return JSON.stringify({ version: 2, images: evidence })
}

export function validateVerificationEvidence(evidence: VerificationEvidence[]): string | null {
  if (evidence.length > MAX_VERIFICATION_EVIDENCE) {
    return `最多保存 ${MAX_VERIFICATION_EVIDENCE} 张验证截图`
  }

  for (const image of evidence) {
    if (!isImageDataUrl(image.dataUrl)) return '验证截图必须是图片数据'
    if (image.dataUrl.length > MAX_VERIFICATION_IMAGE_DATA_URL_LENGTH) {
      return '单张验证截图过大，请压缩后重新上传'
    }
    if (!isAuthenticVerificationEvidence(image)) {
      return '正式核验证据必须来自测试者上传、窗口捕获或后台代验截图'
    }
  }

  return null
}
