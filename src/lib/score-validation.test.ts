import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateScores,
  normalizeScore,
  INTEGER_SCORE,
  HALF_STEP_SCORE,
} from './score-validation'

test('validateScores: 合法评分通过（整数综合分 / 0.5 步长效率质量）', () => {
  assert.equal(
    validateScores({ overallScore: 8, efficiencyScore: 7.5, qualityScore: 9.0 }),
    null,
  )
  assert.equal(
    validateScores({ overallScore: 1, efficiencyScore: 1, qualityScore: 1 }),
    null,
  )
  assert.equal(
    validateScores({ overallScore: 10, efficiencyScore: 10, qualityScore: 10 }),
    null,
  )
})

test('validateScores: 边界值 0.5 步长', () => {
  assert.equal(validateScores({ overallScore: 7, efficiencyScore: 6.5, qualityScore: 8.5 }), null)
})

test('validateScores: 非 required 模式下 undefined 字段跳过校验', () => {
  // 仅校验存在的字段
  assert.equal(validateScores({ overallScore: 8 }), null)
  assert.equal(validateScores({ efficiencyScore: 7.5 }), null)
  assert.equal(validateScores({}), null)
})

test('validateScores: required=true 时未传必填字段报错', () => {
  const err = validateScores({}, { required: true })
  assert.ok(err)
  assert.match(err!, /综合评分.*必填/)
})

test('validateScores: 综合分非整数拒绝', () => {
  const err = validateScores({ overallScore: 7.5, efficiencyScore: 7, qualityScore: 7 })
  assert.ok(err)
  assert.match(err!, /综合评分.*步长/)
})

test('validateScores: 效率/质量评分 0.3 步长拒绝', () => {
  const err1 = validateScores({ overallScore: 7, efficiencyScore: 7.3, qualityScore: 7 })
  assert.ok(err1)
  assert.match(err1!, /交付效率.*步长/)
  const err2 = validateScores({ overallScore: 7, efficiencyScore: 7, qualityScore: 7.1 })
  assert.ok(err2)
  assert.match(err2!, /产物质量.*步长/)
})

test('validateScores: 超范围（<1 或 >10）拒绝', () => {
  assert.ok(validateScores({ overallScore: 0, efficiencyScore: 5, qualityScore: 5 }))
  assert.ok(validateScores({ overallScore: 11, efficiencyScore: 5, qualityScore: 5 }))
  assert.ok(validateScores({ overallScore: 5, efficiencyScore: 0.5, qualityScore: 5 }))
  assert.ok(validateScores({ overallScore: 5, efficiencyScore: 5, qualityScore: 10.5 }))
})

test('validateScores: NaN / 字符串 / null 拒绝', () => {
  assert.ok(validateScores({ overallScore: NaN, efficiencyScore: 5, qualityScore: 5 }))
  assert.ok(validateScores({ overallScore: '8' as any, efficiencyScore: 5, qualityScore: 5 }))
  assert.ok(validateScores({ overallScore: null as any, efficiencyScore: 5, qualityScore: 5 }, { required: true }))
})

test('validateScores: 多个错误合并为中文分号分隔', () => {
  const err = validateScores({ overallScore: 7.5, efficiencyScore: 11, qualityScore: 'bad' as any }, { required: true })
  assert.ok(err)
  // 应包含至少 3 个错误信息
  const parts = err!.split('；')
  assert.ok(parts.length >= 3, '应包含多个错误，实际：' + err)
})

test('normalizeScore: undefined → undefined（无 fallback）', () => {
  assert.equal(normalizeScore(undefined), undefined)
})

test('normalizeScore: null → null', () => {
  assert.equal(normalizeScore(null), null)
})

test('normalizeScore: 合法数字原样返回', () => {
  assert.equal(normalizeScore(8), 8)
  assert.equal(normalizeScore(7.5), 7.5)
})

test('normalizeScore: NaN/非数字 → null', () => {
  assert.equal(normalizeScore(NaN), null)
  assert.equal(normalizeScore('abc' as any), null)
})

test('normalizeScore: fallback 参数仅对 undefined 生效（null 保持 null，显式空值）', () => {
  assert.equal(normalizeScore(undefined, 0), 0)
  assert.equal(normalizeScore(null, 0), null)
})

test('常量: INTEGER_SCORE / HALF_STEP_SCORE 约束正确', () => {
  assert.deepEqual(INTEGER_SCORE, { min: 1, max: 10, step: 1 })
  assert.deepEqual(HALF_STEP_SCORE, { min: 1, max: 10, step: 0.5 })
})
