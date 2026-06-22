import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CODING_RUBRIC,
  AGENT_RUBRIC,
  PRESET_TEMPLATES,
  getDefaultRubric,
  validateRubric,
  serializeDimensions,
  parseDimensions,
  buildRubricGuidancePrompt,
} from './rubric-templates'

test('CODING 模板维度权重之和为 10', () => {
  const sum = CODING_RUBRIC.dimensions.reduce((s, d) => s + d.weight, 0)
  assert.equal(sum, 10, 'CODING 模板权重和')
  assert.equal(CODING_RUBRIC.templateType, 'CODING')
})

test('AGENT 模板维度权重之和为 10', () => {
  const sum = AGENT_RUBRIC.dimensions.reduce((s, d) => s + d.weight, 0)
  assert.ok(Math.abs(sum - 10) < 0.01, 'AGENT 模板权重和应为 10，实际 ' + sum)
  assert.equal(AGENT_RUBRIC.templateType, 'AGENT')
})

test('PRESET_TEMPLATES 包含 CODING 和 AGENT', () => {
  const keys = PRESET_TEMPLATES.map(t => t.key).sort()
  assert.deepEqual(keys, ['AGENT', 'CODING'])
  for (const t of PRESET_TEMPLATES) {
    assert.ok(t.rubric, '每个预设模板必须包含 rubric 对象')
    assert.ok(t.name && t.description, '每个预设模板必须有名称和描述')
  }
})

test('getDefaultRubric: AGENT 类型返回 AGENT 模板，其他/空返回 CODING', () => {
  assert.equal(getDefaultRubric('AGENT').templateType, 'AGENT')
  assert.equal(getDefaultRubric('CODING').templateType, 'CODING')
  assert.equal(getDefaultRubric(null).templateType, 'CODING')
  assert.equal(getDefaultRubric(undefined).templateType, 'CODING')
  assert.equal(getDefaultRubric('OTHER').templateType, 'CODING')
})

test('validateRubric: 非对象/ null 拒绝', () => {
  assert.equal(validateRubric(null).valid, false)
  assert.equal(validateRubric(undefined).valid, false) // 调用 undefined 会抛，但类型上防御
  assert.equal(validateRubric('str').valid, false)
  assert.equal(validateRubric(42).valid, false)
})

test('validateRubric: templateType 非法拒绝', () => {
  const r = { templateType: 'FOO', dimensions: [{ key: 'a', label: 'A', weight: 10, description: '', scoreRange: [0, 10] }], overallFormula: '' }
  const res = validateRubric(r)
  assert.equal(res.valid, false)
  assert.ok(/templateType/.test(res.error || ''))
})

test('validateRubric: dimensions 为空数组拒绝', () => {
  const r = { templateType: 'CUSTOM', dimensions: [], overallFormula: '' }
  const res = validateRubric(r)
  assert.equal(res.valid, false)
  assert.ok(/dimensions/.test(res.error || ''))
})

test('validateRubric: 权重和不为 10 拒绝', () => {
  const r = {
    templateType: 'CUSTOM',
    dimensions: [
      { key: 'a', label: 'A', weight: 5, description: '', scoreRange: [0, 5] },
      { key: 'b', label: 'B', weight: 3, description: '', scoreRange: [0, 3] },
    ],
    overallFormula: 'avg',
  }
  const res = validateRubric(r)
  assert.equal(res.valid, false)
  assert.ok(/权重.*10/.test(res.error || ''), '错误消息应提示权重和必须为 10，实际：' + res.error)
})

test('validateRubric: 维度缺 key/label 拒绝', () => {
  const r1 = { templateType: 'CUSTOM', dimensions: [{ label: 'A', weight: 10, description: '', scoreRange: [0, 10] }], overallFormula: '' } as any
  assert.equal(validateRubric(r1).valid, false)
  const r2 = { templateType: 'CUSTOM', dimensions: [{ key: 'a', weight: 10, description: '', scoreRange: [0, 10] }], overallFormula: '' } as any
  assert.equal(validateRubric(r2).valid, false)
})

test('validateRubric: CODING_RUBRIC 和 AGENT_RUBRIC 均通过校验', () => {
  assert.equal(validateRubric(CODING_RUBRIC).valid, true)
  assert.equal(validateRubric(AGENT_RUBRIC).valid, true)
})

test('validateRubric: rejects non-numeric / string / NaN weights (the ||0 bug)', () => {
  // Previously `dim.weight || 0` would coerce strings/objects to 0 and
  // `Math.abs(NaN - 10) > 0.01` is false, letting invalid rubrics through.
  const bad = {
    templateType: 'CUSTOM',
    dimensions: [
      { key: 'a', label: 'A', weight: 'hello', description: '', scoreRange: [0, 10] },
    ],
    overallFormula: 'a',
  } as any
  const res = validateRubric(bad)
  assert.equal(res.valid, false)
  assert.ok(/权重/.test(res.error || ''), 'should reject string weight: ' + res.error)
})

test('validateRubric: rejects duplicate dimension keys', () => {
  const r = {
    templateType: 'CUSTOM',
    dimensions: [
      { key: 'q', label: 'Q1', weight: 5, description: '', scoreRange: [0, 10] },
      { key: 'q', label: 'Q2', weight: 5, description: '', scoreRange: [0, 10] },
    ],
    overallFormula: 'sum',
  }
  const res = validateRubric(r)
  assert.equal(res.valid, false)
  assert.ok(/重复/.test(res.error || ''))
})

test('validateRubric: rejects invalid key pattern', () => {
  const r = {
    templateType: 'CUSTOM',
    dimensions: [
      { key: 'bad key!', label: 'Bad', weight: 10, description: '', scoreRange: [0, 10] },
    ],
    overallFormula: 'x',
  }
  assert.equal(validateRubric(r).valid, false)
})

test('validateRubric: rejects non-0.5-step weights', () => {
  const r = {
    templateType: 'CUSTOM',
    dimensions: [
      { key: 'a', label: 'A', weight: 3.7, description: '', scoreRange: [0, 10] },
      { key: 'b', label: 'B', weight: 6.3, description: '', scoreRange: [0, 10] },
    ],
    overallFormula: 'sum',
  }
  const res = validateRubric(r)
  assert.equal(res.valid, false)
  assert.ok(/步长/.test(res.error || ''))
})

test('serializeDimensions / parseDimensions 往返稳定', () => {
  const dims = CODING_RUBRIC.dimensions
  const json = serializeDimensions(dims)
  assert.equal(typeof json, 'string')
  const parsed = parseDimensions(json)
  assert.equal(parsed.length, dims.length)
  assert.equal(parsed[0].key, dims[0].key)
  assert.equal(parsed[0].weight, dims[0].weight)
})

test('parseDimensions 对 null/undefined/非法 JSON/非数组安全返回空数组', () => {
  assert.deepEqual(parseDimensions(null), [])
  assert.deepEqual(parseDimensions(undefined), [])
  assert.deepEqual(parseDimensions(''), [])
  assert.deepEqual(parseDimensions('{not json'), [])
  assert.deepEqual(parseDimensions('"a string"'), [])
})

test('buildRubricGuidancePrompt 包含模板信息、维度描述、封顶规则（CODING）', () => {
  const prompt = buildRubricGuidancePrompt(CODING_RUBRIC)
  assert.ok(prompt.includes('评分规则说明'))
  assert.ok(prompt.includes('代码开发'))
  assert.ok(prompt.includes('需求完成度'))
  assert.ok(prompt.includes('5+3+2') === false, '不应包含字面 "+"；应包含公式文本')
  assert.ok(prompt.includes('封顶规则'))
  assert.ok(prompt.includes('常见扣分点'))
})

test('buildRubricGuidancePrompt AGENT 模板包含六个维度且不含封顶规则段落', () => {
  const prompt = buildRubricGuidancePrompt(AGENT_RUBRIC)
  assert.ok(prompt.includes('Agent 智能体'))
  assert.ok(prompt.includes('指令遵循'))
  assert.ok(prompt.includes('规划能力'))
  assert.ok(prompt.includes('工具调用'))
  assert.ok(prompt.includes('推理'))
  assert.ok(prompt.includes('幻觉'))
  assert.ok(prompt.includes('交付结果'))
  assert.ok(!prompt.includes('封顶规则'), 'AGENT 模板不应包含封顶规则')
})

test('buildRubricGuidancePrompt 自定义模板使用"自定义"标签', () => {
  const custom = {
    templateType: 'CUSTOM' as const,
    dimensions: [
      { key: 'a', label: '自定义维度 A', weight: 6, description: '维度 A 说明', scoreRange: [0, 6] as [number, number] },
      { key: 'b', label: '自定义维度 B', weight: 4, description: '维度 B 说明', scoreRange: [0, 4] as [number, number] },
    ],
    overallFormula: 'A*0.6 + B*0.4',
  }
  const prompt = buildRubricGuidancePrompt(custom)
  assert.ok(prompt.includes('自定义'))
  assert.ok(prompt.includes('自定义维度 A'))
  assert.ok(prompt.includes('维度 A 说明'))
})
