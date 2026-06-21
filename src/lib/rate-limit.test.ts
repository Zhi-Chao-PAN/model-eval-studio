import assert from 'node:assert/strict'
import test from 'node:test'
import { rateLimitBucketId } from './rate-limit'

test('builds stable bounded bucket ids without exposing the identifier', () => {
  const first = rateLimitBucketId('ai-report', 'user-secret-id')
  const second = rateLimitBucketId('ai-report', 'user-secret-id')

  assert.equal(first, second)
  assert.match(first, /^ai-report:[a-f0-9]{40}$/)
  assert.equal(first.includes('user-secret-id'), false)
})

test('keeps different scopes and identities in separate buckets', () => {
  assert.notEqual(rateLimitBucketId('login', 'same'), rateLimitBucketId('register', 'same'))
  assert.notEqual(rateLimitBucketId('login', 'first'), rateLimitBucketId('login', 'second'))
})
