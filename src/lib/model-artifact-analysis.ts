export const MODEL_ARTIFACT_ANALYSIS_VERSION = 1

export type ArtifactAnalysisArtifact = {
  id: string
  name: string
  size?: number | null
  createdAt?: Date | string | null
}

export type StoredModelArtifactAnalysis = {
  version: 1
  modelCode: string
  analyzedAt: string
  artifactSignature: string
  artifactCount: number
  verificationScreenshotUrls?: string | null
  verificationSummary: string
  filesAnalysis: string
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
      typeof value.verificationSummary !== 'string' ||
      typeof value.filesAnalysis !== 'string'
    ) {
      return null
    }
    return value as StoredModelArtifactAnalysis
  } catch {
    return null
  }
}

export function isFreshModelArtifactAnalysis(
  analysis: StoredModelArtifactAnalysis | null,
  artifacts: ArtifactAnalysisArtifact[],
): analysis is StoredModelArtifactAnalysis {
  return Boolean(
    analysis &&
    analysis.artifactSignature === artifactAnalysisSignature(artifacts) &&
    analysis.artifactCount === artifacts.length,
  )
}
