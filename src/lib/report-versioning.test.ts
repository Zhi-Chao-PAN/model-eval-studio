import assert from 'node:assert/strict'
import test from 'node:test'
import { hashContent, buildGenerationSnapshot, buildGenerationConfig } from './report-versioning'

test('hashContent: null/undefined/空串返回 undefined', () => {
  assert.equal(hashContent(null), undefined)
  assert.equal(hashContent(undefined), undefined)
  assert.equal(hashContent(''), undefined)
})

test('hashContent: 相同输入产出相同 16 字符 hex 摘要', () => {
  const a = hashContent('hello world')!
  const b = hashContent('hello world')!
  assert.equal(a, b)
  assert.equal(a.length, 16, '应返回 hex 前 16 字符')
  assert.ok(/^[0-9a-f]{16}$/.test(a), '应是 16 位 hex')
})

test('hashContent: 不同输入产出不同摘要（基本碰撞检测）', () => {
  const a = hashContent('hello')!
  const b = hashContent('world')!
  assert.notEqual(a, b)
})

test('buildGenerationSnapshot: 填充必要字段且对 null 字段安全', () => {
  const json = buildGenerationSnapshot({
    task: { title: '任务 A', description: null, backgroundUsed: 'bg' },
    model: { hardMetricsJson: null, processText: null, artifactAnalysisJson: null, verificationScreenshotUrls: null, verificationSummary: null },
    artifactCount: 0,
    aiModel: 'gpt-4o-mini',
    aiProvider: 'openai',
  })
  const obj = JSON.parse(json)
  assert.equal(obj.taskTitle, '任务 A')
  assert.equal(obj.taskDescription, null)
  assert.equal(obj.taskBackground, 'bg')
  assert.equal(obj.artifactCount, 0)
  assert.equal(obj.processTextHash, undefined)
  assert.equal(obj.processTextLength, 0)
  assert.equal(obj.aiModel, 'gpt-4o-mini')
  assert.equal(obj.aiProvider, 'openai')
  assert.ok(obj.generatedAt, '必须包含生成时间')
})

test('buildGenerationSnapshot: 生成 processText 哈希与长度', () => {
  const text = '这是一段测试轨迹文本，长度足够产生非空 hash。'.repeat(5)
  const json = buildGenerationSnapshot({
    task: { title: 't', description: null, backgroundUsed: null },
    model: { hardMetricsJson: null, processText: text, artifactAnalysisJson: null, verificationScreenshotUrls: null, verificationSummary: null },
  })
  const obj = JSON.parse(json)
  assert.equal(obj.processTextLength, text.length)
  assert.ok(typeof obj.processTextHash === 'string')
  assert.equal(obj.processTextHash.length, 16)
})

test('buildGenerationSnapshot: hardMetricsJson 合法 JSON 被解析为对象，非法 JSON 置 null', () => {
  const ok = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: '{"a":1,"b":[2,3]}', processText: null, artifactAnalysisJson: null, verificationScreenshotUrls: null, verificationSummary: null },
  }))
  assert.deepEqual(ok.hardMetrics, { a: 1, b: [2, 3] })

  const bad = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: '{not json', processText: null, artifactAnalysisJson: null, verificationScreenshotUrls: null, verificationSummary: null },
  }))
  assert.equal(bad.hardMetrics, null)
})

test('buildGenerationSnapshot: 从 artifactAnalysisJson 中提取 artifactSignature', () => {
  const withSig = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: null, processText: null, artifactAnalysisJson: '{"artifactSignature":"sig_abc123","other":"x"}', verificationScreenshotUrls: null, verificationSummary: null },
  }))
  assert.equal(withSig.artifactAnalysisSignature, 'sig_abc123')

  const noSig = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: null, processText: null, artifactAnalysisJson: '{"other":"x"}', verificationScreenshotUrls: null, verificationSummary: null },
  }))
  assert.equal(noSig.artifactAnalysisSignature, null)

  const badJson = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: null, processText: null, artifactAnalysisJson: 'garbage', verificationScreenshotUrls: null, verificationSummary: null },
  }))
  assert.equal(badJson.artifactAnalysisSignature, null)
})

test('buildGenerationSnapshot: 包含 token/duration 指标', () => {
  const obj = JSON.parse(buildGenerationSnapshot({
    task: { title: 't' },
    model: { hardMetricsJson: null, processText: null, artifactAnalysisJson: null, verificationScreenshotUrls: null, verificationSummary: null },
    tokenInput: 1234, tokenOutput: 567, durationMs: 8900,
  }))
  assert.equal(obj.tokenInput, 1234)
  assert.equal(obj.tokenOutput, 567)
  assert.equal(obj.durationMs, 8900)
})

test('buildGenerationConfig: 记录 rubric 信息与 taskType；无 rubric 时字段为 undefined', () => {
  const withRubric = JSON.parse(buildGenerationConfig({
    rubric: { templateType: 'CODING', dimensionsJson: '[{"key":"a"}]', overallFormula: 'A+B' },
    taskType: 'CODING',
  }))
  assert.equal(withRubric.rubricTemplateType, 'CODING')
  assert.equal(withRubric.rubricDimensionsJson, '[{"key":"a"}]')
  assert.equal(withRubric.rubricOverallFormula, 'A+B')
  assert.equal(withRubric.taskType, 'CODING')

  const empty = JSON.parse(buildGenerationConfig({}))
  assert.equal(empty.rubricTemplateType, undefined)
  assert.equal(empty.rubricDimensionsJson, undefined)
  assert.equal(empty.rubricOverallFormula, undefined)
  assert.equal(empty.taskType, undefined)
})

test('buildGenerationConfig: rubric 为 null 时安全', () => {
  const obj = JSON.parse(buildGenerationConfig({ rubric: null, taskType: 'AGENT' }))
  assert.equal(obj.rubricTemplateType, undefined)
  assert.equal(obj.taskType, 'AGENT')
})
