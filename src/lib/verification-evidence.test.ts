import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAuthenticVerificationEvidence,
  serializeVerificationEvidence,
  verificationEvidenceSignature,
  type VerificationEvidence,
} from './verification-evidence'

function evidence(source: VerificationEvidence['source'], suffix = ''): VerificationEvidence {
  return {
    id: `${source}${suffix}`,
    name: `${source}${suffix}.jpg`,
    dataUrl: `data:image/jpeg;base64,AA${suffix}==`,
    source,
    capturedAt: '2026-06-20T10:00:00.000Z',
  }
}

test('only tester-uploaded local acceptance screenshots count as formal evidence', () => {
  assert.equal(isAuthenticVerificationEvidence(evidence('tester_upload')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('screen_capture')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('backend_capture')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('sandbox_auto')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('legacy_auto')), false)
})

test('builds a stable signature from authentic verification screenshots only', () => {
  const current = [evidence('tester_upload', 'a'), evidence('tester_upload', 'b')]
  const withLegacy = [...current, evidence('legacy_auto', 'legacy')]

  assert.equal(
    verificationEvidenceSignature(serializeVerificationEvidence(current)),
    verificationEvidenceSignature(serializeVerificationEvidence([...current].reverse())),
  )
  assert.equal(
    verificationEvidenceSignature(serializeVerificationEvidence(current)),
    verificationEvidenceSignature(serializeVerificationEvidence(withLegacy)),
  )
  assert.notEqual(
    verificationEvidenceSignature(serializeVerificationEvidence(current)),
    verificationEvidenceSignature(serializeVerificationEvidence([evidence('tester_upload', 'c')])),
  )
})
