import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactAnalysisSignature,
  isFreshArtifactFileAnalysis,
  isFreshModelArtifactAnalysis,
  parseStoredModelArtifactAnalysis,
} from './model-artifact-analysis'

const artifacts = [
  { id: 'artifact-a', name: 'report.docx', size: 1024, createdAt: '2026-06-20T10:00:00.000Z' },
  { id: 'artifact-b', name: 'appendix.xlsx', size: 2048, createdAt: '2026-06-20T10:01:00.000Z' },
]

test('keeps the artifact analysis signature stable when artifact order changes', () => {
  assert.equal(
    artifactAnalysisSignature(artifacts),
    artifactAnalysisSignature([...artifacts].reverse()),
  )
})

test('reuses file analysis only while the complete artifact set is unchanged', () => {
  const analysis = parseStoredModelArtifactAnalysis(JSON.stringify({
    version: 2,
    modelCode: 'vortex',
    analyzedAt: '2026-06-20T10:02:00.000Z',
    artifactSignature: artifactAnalysisSignature(artifacts),
    artifactCount: artifacts.length,
    verificationEvidenceSignature: 'evidence-a',
    verificationSummary: '已核验报告正文和附表。',
    filesAnalysis: '交付物结构完整。',
  }))

  assert.equal(isFreshArtifactFileAnalysis(analysis, artifacts), true)
  assert.equal(
    isFreshArtifactFileAnalysis(analysis, [
      { ...artifacts[0], size: 1025 },
      artifacts[1],
    ]),
    false,
  )
})

test('treats verification evidence freshness independently from file analysis freshness', () => {
  const analysis = parseStoredModelArtifactAnalysis(JSON.stringify({
    version: 2,
    modelCode: 'vortex',
    analyzedAt: '2026-06-20T10:02:00.000Z',
    artifactSignature: artifactAnalysisSignature(artifacts),
    artifactCount: artifacts.length,
    verificationEvidenceSignature: 'old-evidence',
    verificationSummary: '旧截图结论。',
    filesAnalysis: '交付物结构完整。',
  }))

  assert.equal(isFreshArtifactFileAnalysis(analysis, artifacts), true)
  assert.equal(
    isFreshModelArtifactAnalysis(analysis, artifacts, { verificationEvidenceSignature: 'new-evidence' }),
    false,
  )
  assert.equal(
    isFreshModelArtifactAnalysis(analysis, artifacts, { verificationEvidenceSignature: 'old-evidence' }),
    true,
  )
})

test('rejects malformed stored artifact analysis', () => {
  assert.equal(parseStoredModelArtifactAnalysis('{"version":1}'), null)
  assert.equal(parseStoredModelArtifactAnalysis('not-json'), null)
})
