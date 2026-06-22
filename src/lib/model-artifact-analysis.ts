export const MODEL_ARTIFACT_ANALYSIS_VERSION = 2

// 产物分析的文件数量和字符数上限
// 常量放在这里是因为需要同时被服务端（artifact-analysis-runtime）
// 和客户端（StepArtifact 显示覆盖范围提示）引用
export const FILE_ANALYSIS_LIMIT = 4
export const FILE_ANALYSIS_CHAR_LIMIT = 32_000

export type ArtifactAnalysisArtifact = {
  id: string
  name: string
  size?: number | null
  createdAt?: Date | string | null
}

export type StoredModelArtifactAnalysis = {
  version: 2
  modelCode: string
  analyzedAt: string
  artifactSignature: string
  artifactCount: number
  verificationEvidenceSignature?: string | null
  verificationScreenshotUrls?: string | null
  verificationSummary: string
  filesAnalysis: string
  /**
   * v2.1+ 可选字段：序列化进 artifactAnalysisJson 的证据链 JSON 字符串。
   * 解析时如果存在，会随 StoredModelArtifactAnalysis 一起返回，供 UI 展示
   * 和报告生成 prompt 使用；缺失时不破坏现有数据。
   */
  evidenceChain?: string | null
}

function createdAtValue(value: ArtifactAnalysisArtifact['createdAt']): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function artifactAnalysisSignature(artifacts: ArtifactAnalysisArtifact[]): string {
  return artifacts
    .map((artifact) => [
      artifact.id,
      artifact.name,
      artifact.size ?? '',
      createdAtValue(artifact.createdAt),
    ].join(':'))
    .sort()
    .join('|')
}

export function parseStoredModelArtifactAnalysis(raw?: string | null): StoredModelArtifactAnalysis | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredModelArtifactAnalysis>
    if (
      value.version !== MODEL_ARTIFACT_ANALYSIS_VERSION ||
      typeof value.modelCode !== 'string' ||
      typeof value.analyzedAt !== 'string' ||
      typeof value.artifactSignature !== 'string' ||
      typeof value.artifactCount !== 'number' ||
      typeof value.verificationSummary !== 'string' ||
      typeof value.filesAnalysis !== 'string'
    ) {
      return null
    }
    const result: StoredModelArtifactAnalysis = {
      version: 2,
      modelCode: value.modelCode,
      analyzedAt: value.analyzedAt,
      artifactSignature: value.artifactSignature,
      artifactCount: value.artifactCount,
      verificationEvidenceSignature:
        typeof value.verificationEvidenceSignature === 'string' ? value.verificationEvidenceSignature : null,
      verificationScreenshotUrls:
        typeof value.verificationScreenshotUrls === 'string' ? value.verificationScreenshotUrls : null,
      verificationSummary: value.verificationSummary,
      filesAnalysis: value.filesAnalysis,
    }
    if (typeof value.evidenceChain === 'string') {
      result.evidenceChain = value.evidenceChain
    }
    return result
  } catch {
    return null
  }
}

export function isFreshArtifactFileAnalysis(
  analysis: StoredModelArtifactAnalysis | null,
  artifacts: ArtifactAnalysisArtifact[],
): analysis is StoredModelArtifactAnalysis {
  return Boolean(
    analysis &&
    analysis.artifactSignature === artifactAnalysisSignature(artifacts) &&
    analysis.artifactCount === artifacts.length,
  )
}

export function isFreshModelArtifactAnalysis(
  analysis: StoredModelArtifactAnalysis | null,
  artifacts: ArtifactAnalysisArtifact[],
  options?: { verificationEvidenceSignature?: string | null },
): analysis is StoredModelArtifactAnalysis {
  if (!isFreshArtifactFileAnalysis(analysis, artifacts)) return false
  if (!options || options.verificationEvidenceSignature === undefined) return true
  return (analysis.verificationEvidenceSignature || '') === (options.verificationEvidenceSignature || '')
}
