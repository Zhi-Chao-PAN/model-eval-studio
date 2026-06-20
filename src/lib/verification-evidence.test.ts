import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAuthenticVerificationEvidence,
  type VerificationEvidence,
} from './verification-evidence'

function evidence(source: VerificationEvidence['source']): VerificationEvidence {
  return { id: source, name: `${source}.jpg`, dataUrl: 'data:image/jpeg;base64,AA==', source }
}

test('only tester-uploaded local acceptance screenshots count as formal evidence', () => {
  assert.equal(isAuthenticVerificationEvidence(evidence('tester_upload')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('screen_capture')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('backend_capture')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('sandbox_auto')), false)
  assert.equal(isAuthenticVerificationEvidence(evidence('legacy_auto')), false)
})
