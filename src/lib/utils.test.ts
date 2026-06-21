import assert from 'node:assert/strict'
import test from 'node:test'
import { clampDbText, clampRequiredText, DB_TEXT_LIMITS, cn } from './utils'

test('clampDbText: null/undefined 原样返回', () => {
  assert.equal(clampDbText(null, 100), null)
  assert.equal(clampDbText(undefined, 100), undefined)
})

test('clampDbText: 短文本原样返回', () => {
  assert.equal(clampDbText('hello', 100), 'hello')
  assert.equal(clampDbText('', 100), '')
})

test('clampDbText: 超长文本截断并追加省略号', () => {
  const s = 'a'.repeat(100)
  const result = clampDbText(s, 20)
  assert.equal(result!.length, 20)
  assert.ok(result!.endsWith('...'))
  assert.ok(result!.startsWith('a'.repeat(17)))
})

test('clampDbText: 等于上限时不截断', () => {
  const s = 'a'.repeat(50)
  assert.equal(clampDbText(s, 50), s)
})

test('clampDbText: maxLen 过小（<3）时返回纯省略号，不抛错', () => {
  const result = clampDbText('abcdef', 2)
  assert.equal(typeof result, 'string')
  // 当上限小于省略号长度时，返回纯省略号（3 字符），这是 clamp 的最小安全长度
  assert.ok(result === '...' || result!.length <= 2, '应是省略号或不超过上限')
})

test('clampDbText: 非字符串输入强转字符串', () => {
  assert.equal(clampDbText(12345 as any, 10), '12345')
})

test('clampRequiredText: null/undefined/空串返回空串', () => {
  assert.equal(clampRequiredText(null, 100), '')
  assert.equal(clampRequiredText(undefined, 100), '')
  assert.equal(clampRequiredText('', 100), '')
})

test('clampRequiredText: 正常文本原样返回', () => {
  assert.equal(clampRequiredText('hello', 100), 'hello')
})

test('clampRequiredText: 超长截断后仍返回 string', () => {
  const s = 'x'.repeat(200)
  const r = clampRequiredText(s, 50)
  assert.equal(typeof r, 'string')
  assert.ok(r.length <= 50)
  assert.ok(r.endsWith('...'))
})

test('DB_TEXT_LIMITS: COMMENT/ANALYSIS/VERIFICATION 长度合理', () => {
  assert.ok(DB_TEXT_LIMITS.COMMENT >= 4_000 && DB_TEXT_LIMITS.COMMENT <= 16_000)
  assert.ok(DB_TEXT_LIMITS.ANALYSIS > DB_TEXT_LIMITS.COMMENT, 'ANALYSIS 应大于 COMMENT')
  assert.ok(DB_TEXT_LIMITS.VERIFICATION > 0 && DB_TEXT_LIMITS.VERIFICATION < DB_TEXT_LIMITS.COMMENT)
})

test('cn: 合并类名（clsx + tailwind-merge）', () => {
  // 简单合并
  assert.equal(cn('a', 'b'), 'a b')
  // 条件类
  assert.equal(cn('a', false && 'b', 'c'), 'a c')
  // tailwind-merge 覆盖冲突
  assert.equal(cn('px-2', 'px-4'), 'px-4')
})
