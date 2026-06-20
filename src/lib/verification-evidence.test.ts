import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isAuthenticVerificationEvidence,
  type VerificationEvidence,
} from './verification-evidence'

function evidence(source: VerificationEvidence['source']): VerificationEvidence {
  return { id: source, name: `${source}.jpg`, dataUrl: 'data:image/jpeg;base64,AA==', source }
}

test('manual evidence and backend delegated verification count as formal evidence', () => {
  assert.equal(isAuthenticVerificationEvidence(evidence('tester_upload')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('screen_capture')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('backend_capture')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('sandbox_auto')), true)
  assert.equal(isAuthenticVerificationEvidence(evidence('legacy_auto')), false)
})
