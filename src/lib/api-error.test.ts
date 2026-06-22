import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'
import { apiError, errorMessage, safeServerError } from './api-error'

// process.env.NODE_ENV is typed read-only by @types/node; use a local writable ref.
const env = process.env as Record<string, string | undefined>

describe('errorMessage', () => {
  it('extracts message from Error instances', () => {
    assert.equal(errorMessage(new Error('boom')), 'boom')
  })
  it('passes through string errors', () => {
    assert.equal(errorMessage('oops'), 'oops')
  })
  it('returns 未知错误 for null/undefined/object/number', () => {
    assert.equal(errorMessage(null), '未知错误')
    assert.equal(errorMessage(undefined), '未知错误')
    assert.equal(errorMessage({ code: 'E1' }), '未知错误')
    assert.equal(errorMessage(42), '未知错误')
  })
})

describe('safeServerError', () => {
  const originalEnv = env.NODE_ENV
  after(() => { env.NODE_ENV = originalEnv })

  it('maps Prisma P2002 (unique violation) to user-friendly message', () => {
    env.NODE_ENV = 'production'
    const { status, message } = safeServerError(
      new Error('Invalid `prisma.user.create()` invocation:\n\nUnique constraint failed on the fields: (`username`)\nCode: P2002'),
      'user:create',
    )
    assert.equal(status, 400)
    assert.ok(!/P2002/.test(message), 'should not expose P-code')
    assert.ok(message.includes('已存在'))
  })

  it('maps Prisma P2003 (FK violation) to user-friendly message', () => {
    env.NODE_ENV = 'production'
    const { status, message } = safeServerError(
      new Error('Foreign key constraint failed on the field: `taskId` (P2003)'),
      'artifact:create',
    )
    assert.equal(status, 400)
    assert.ok(!/P2003/.test(message))
  })

  it('maps P2025 / record not found', () => {
    env.NODE_ENV = 'production'
    const { message } = safeServerError(
      new Error('Record to update not found. (P2025)'),
      'task:update',
    )
    assert.ok(message.includes('不存在'))
  })

  it('returns generic 500 in production for unknown errors', () => {
    env.NODE_ENV = 'production'
    const { status, message } = safeServerError(
      new Error('ECONNREFUSED 10.0.0.1:5432'),
      'db:query',
    )
    assert.equal(status, 500)
    assert.ok(!/ECONNREFUSED|10\.0\.0\.1|5432/.test(message))
    assert.ok(message.includes('内部错误'))
  })

  it('strips absolute file paths from dev error messages', () => {
    env.NODE_ENV = 'development'
    const { message } = safeServerError(
      new Error('failed at /home/deploy/app/node_modules/.prisma/runtime/index.js:42'),
      'test',
    )
    assert.ok(!/\/home\/deploy/.test(message), 'file path leaked')
  })

  it('strips connection strings from dev error messages', () => {
    env.NODE_ENV = 'development'
    const { message } = safeServerError(
      new Error('connect failed: postgres://user:secret@db.internal:5432/prod'),
      'test',
    )
    assert.ok(!/postgres:\/\//.test(message))
    assert.ok(!/user:secret/.test(message))
  })

  it('handles non-error inputs without throwing', () => {
    env.NODE_ENV = 'production'
    const { status } = safeServerError('plain string', 'ctx')
    assert.equal(status, 500)
    const r2 = safeServerError(null, 'ctx')
    assert.equal(r2.status, 500)
    const r3 = safeServerError({ code: 'E' }, 'ctx')
    assert.equal(r3.status, 500)
  })

  it('apiError returns JSON response with status and content-type', async () => {
    const res = apiError('bad request', 400)
    assert.equal(res.status, 400)
    assert.equal(res.headers.get('content-type'), 'application/json')
    const body = await res.json()
    assert.equal(body.error, 'bad request')
  })

  it('apiError hides details in production', async () => {
    env.NODE_ENV = 'production'
    const res = apiError('bad', 400, 'CODE', { stack: 'trace' })
    const body = await res.json()
    assert.equal(body.details, undefined)
    env.NODE_ENV = 'development'
    const res2 = apiError('bad', 400, 'CODE', { stack: 'trace' })
    const body2 = await res2.json()
    assert.deepEqual(body2.details, { stack: 'trace' })
  })
})
