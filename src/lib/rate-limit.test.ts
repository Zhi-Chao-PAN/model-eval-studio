import assert from 'node:assert/strict'
import test from 'node:test'
import { getRequestIp, rateLimitBucketId, rateLimitResponse } from './rate-limit'

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

test('getRequestIp: 从 x-forwarded-for 取第一个 IP 并 trim', () => {
  const req = new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } })
  assert.equal(getRequestIp(req), '203.0.113.5')
  const req2 = new Request('http://x/', { headers: { 'x-forwarded-for': '  192.0.2.1  , 10.0.0.1' } })
  assert.equal(getRequestIp(req2), '192.0.2.1')
})

test('getRequestIp: x-forwarded-for 缺失时回退到 x-real-ip', () => {
  const req = new Request('http://x/', { headers: { 'x-real-ip': '198.51.100.7' } })
  assert.equal(getRequestIp(req), '198.51.100.7')
})

test('getRequestIp: 无任何 IP 头返回 unknown', () => {
  const req = new Request('http://x/')
  assert.equal(getRequestIp(req), 'unknown')
})

test('rateLimitResponse: 返回 429 并带 Retry-After/限流头 + JSON body', async () => {
  const resetAt = new Date('2026-01-01T00:00:42Z')
  const res = rateLimitResponse({
    allowed: false,
    limit: 5,
    remaining: 0,
    retryAfterSeconds: 42,
    resetAt,
  })
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '42')
  assert.equal(res.headers.get('X-RateLimit-Limit'), '5')
  assert.equal(res.headers.get('X-RateLimit-Remaining'), '0')
  assert.equal(res.headers.get('Content-Type'), 'application/json')
  const body = await res.json()
  assert.equal(body.retryAfterSeconds, 42)
  assert.match(body.error, /42/)
})
