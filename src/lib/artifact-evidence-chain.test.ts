import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvidence,
  buildEvidenceChainSummaryForReport,
  EVIDENCE_TYPE_VALUES,
  EVIDENCE_SOURCE_VALUES,
  parseStoredEvidenceChain,
  serializeEvidenceChain,
  type ArtifactEvidence,
} from './artifact-evidence-chain'

test('buildEvidence: 生成 file_manifest / parsed_content / limitation / auto_candidate 四种基础证据', () => {
  const m = 'model-1'
  const items: ArtifactEvidence[] = [
    buildEvidence({
      modelId: m,
      evidenceType: 'file_manifest',
      source: 'auto_runner',
      title: '已收集 4 个产物',
      summary: 'ZIP 源码 + 2 份报告 + 1 张图。',
    }),
    buildEvidence({
      modelId: m,
      evidenceType: 'parsed_content',
      source: 'parser',
      title: 'docx 主报告',
      summary: '已抽取 1.2k 字正文与 5 个标题。',
      artifactName: 'report.docx',
    }),
    buildEvidence({
      modelId: m,
      evidenceType: 'limitation',
      source: 'auto_runner',
      title: '未执行不可信代码',
      summary: '本轮自动验收未运行产物内部脚本。',
    }),
    buildEvidence({
      modelId: m,
      evidenceType: 'auto_candidate',
      source: 'auto_runner',
      title: '候选证据：报告结构完整',
      summary: '主产物为长篇文档，含目录与结论。',
    }),
  ]
  assert.equal(items.length, 4)
  for (const item of items) {
    assert.equal(item.modelId, m)
    assert.ok(item.evidenceId.startsWith('evi-'))
    assert.ok(item.title.length > 0)
    assert.ok(item.summary.length > 0)
  }
})

test('buildEvidence: 超长 title / summary / detail 被截断；元数据中字符串同步截断', () => {
  const longTitle = 'x'.repeat(500)
  const longDetail = 'y'.repeat(3000)
  const item = buildEvidence({
    modelId: 'm',
    evidenceType: 'quality_signal',
    source: 'auto_runner',
    title: longTitle,
    summary: '  multiple   spaces  \n  in summary  ',
    detail: longDetail,
    metadata: { description: 'z'.repeat(2000), count: 3, flag: true },
  })
  assert.ok(item.title.length <= 80)
  assert.ok(item.title.endsWith('…'))
  assert.equal(item.summary, 'multiple spaces in summary')
  assert.ok((item.detail || '').length <= 1200)
  const md = item.metadata as Record<string, unknown>
  assert.equal(md.count, 3)
  assert.equal(md.flag, true)
  assert.ok(typeof md.description === 'string' && (md.description as string).length <= 1200)
})

test('buildEvidence: HTML 错误页不被当作有效标题', () => {
  const item = buildEvidence({
    modelId: 'm',
    evidenceType: 'parsed_content',
    source: 'parser',
    title: '<!DOCTYPE html><html><body>500 Internal Server Error</body></html>',
    summary: '服务端返回了 HTML 错误页',
  })
  assert.ok(!/<\/?(html|body|head|!doctype)\b/i.test(item.title))
})

test('buildEvidence: 不允许在 metadata 中塞入 think / 思维链字段', () => {
  const item = buildEvidence({
    modelId: 'm',
    evidenceType: 'auto_candidate',
    source: 'auto_runner',
    title: 't',
    summary: 's',
    metadata: {
      think: '<|channel|>analysis<long>...thinking...</|>',
      reasoning: 'raw cot chain',
      chain_of_thought: 'forbidden',
      safe: 'keep',
    },
  })
  const md = item.metadata as Record<string, unknown>
  assert.equal(md.think, undefined)
  assert.equal(md.reasoning, undefined)
  assert.equal(md.chain_of_thought, undefined)
  assert.equal(md.safe, 'keep')
  assert.equal(md._droppedKeys, 3)
})

test('buildEvidence: 数组 metadata 元素超过 32 截断、字符串统一截断', () => {
  const bigArray = Array.from({ length: 50 }, (_, i) => `item-${i}-${'z'.repeat(500)}`)
  const item = buildEvidence({
    modelId: 'm',
    evidenceType: 'file_manifest',
    source: 'auto_runner',
    title: 't',
    summary: 's',
    metadata: { names: bigArray },
  })
  const md = item.metadata as Record<string, unknown>
  const names = md.names as unknown[]
  assert.ok(Array.isArray(names))
  assert.equal((names as unknown[]).length, 32)
  for (const n of names as string[]) {
    assert.ok(n.length <= 280)
  }
})

test('EVIDENCE_TYPE_VALUES / EVIDENCE_SOURCE_VALUES 保持稳定枚举', () => {
  assert.deepEqual(EVIDENCE_TYPE_VALUES, [
    'file_manifest', 'parsed_content', 'primary_artifact', 'structure_check',
    'quality_signal', 'limitation', 'auto_candidate', 'error',
  ])
  assert.deepEqual(EVIDENCE_SOURCE_VALUES, [
    'artifact_upload', 'parser', 'auto_runner', 'analysis_runtime',
  ])
})

test('serializeEvidenceChain / parseStoredEvidenceChain 往返稳定', () => {
  const items: ArtifactEvidence[] = [
    buildEvidence({
      modelId: 'model-A',
      evidenceType: 'file_manifest',
      source: 'auto_runner',
      title: 'manifest',
      summary: 's',
    }),
  ]
  const chain = serializeEvidenceChain(items, 'model-A')
  const json = JSON.stringify(chain)
  const parsed = parseStoredEvidenceChain(json)
  assert.ok(parsed)
  assert.equal(parsed!.modelId, 'model-A')
  assert.equal(parsed!.items.length, 1)
  assert.equal(parsed!.items[0].title, 'manifest')
})

test('parseStoredEvidenceChain: 损坏的 JSON 返回 null，不会抛错', () => {
  assert.equal(parseStoredEvidenceChain('not-json'), null)
  assert.equal(parseStoredEvidenceChain(null), null)
  assert.equal(parseStoredEvidenceChain('{"version":2}'), null)
})

test('buildEvidenceChainSummaryForReport: 只抽取 auto_runner / parser / analysis_runtime 来源', () => {
  const items: ArtifactEvidence[] = [
    buildEvidence({
      modelId: 'm',
      evidenceType: 'auto_candidate',
      source: 'auto_runner',
      title: 'A1',
      summary: 'candidate summary',
    }),
    buildEvidence({
      modelId: 'm',
      evidenceType: 'auto_candidate',
      source: 'artifact_upload',
      title: 'B1',
      summary: 'should be excluded — this came from raw artifact, not a candidate',
    }),
    buildEvidence({
      modelId: 'm',
      evidenceType: 'parsed_content',
      source: 'parser',
      title: 'C1',
      summary: 'parser summary',
    }),
  ]
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain)
  assert.match(summary, /A1/)
  assert.match(summary, /C1/)
  assert.doesNotMatch(summary, /B1/)
  assert.match(summary, /后台候选证据摘要/)
})

test('buildEvidenceChainSummaryForReport: 空 chain 返回空字符串', () => {
  assert.equal(buildEvidenceChainSummaryForReport(null), '')
  assert.equal(buildEvidenceChainSummaryForReport(serializeEvidenceChain([], 'm')), '')
})

test('buildEvidenceChainSummaryForReport: 超长会提前截断，不再追加后续证据', () => {
  const items: ArtifactEvidence[] = Array.from({ length: 50 }, (_, i) =>
    buildEvidence({
      modelId: 'm',
      evidenceType: 'quality_signal',
      source: 'auto_runner',
      title: '长标题' + i,
      summary: '长摘要'.repeat(20),
    }),
  )
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain, { maxChars: 400 })
  assert.ok(summary.length <= 800, `expected truncated, got ${summary.length}`)
})