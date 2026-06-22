import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvidence,
  buildEvidenceChainSummaryForReport,
  EVIDENCE_TYPE_VALUES,
  EVIDENCE_SOURCE_VALUES,
  groupEvidenceByType,
  loadEvidenceChainFromAnalysis,
  parseStoredEvidenceChain,
  REPORT_SUMMARY_TYPE_PRIORITY,
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
// ── V1.1 解析/分组/摘要硬化 ────────────────────────────────────────────

test('parseStoredEvidenceChain: 非法 evidenceType / source 被过滤', () => {
  const raw = JSON.stringify({
    version: 1,
    modelId: 'm',
    generatedAt: '2026-06-23T00:00:00.000Z',
    items: [
      {
        evidenceId: 'evi-ok',
        title: 'ok',
        summary: 's',
        evidenceType: 'primary_artifact',
        source: 'auto_runner',
        createdAt: '2026-06-23T00:00:00.000Z',
      },
      {
        evidenceId: 'evi-bad-type',
        title: 'bad type',
        summary: 's',
        evidenceType: 'unknown_type',
        source: 'auto_runner',
        createdAt: '2026-06-23T00:00:00.000Z',
      },
      {
        evidenceId: 'evi-bad-source',
        title: 'bad source',
        summary: 's',
        evidenceType: 'quality_signal',
        source: 'tester_upload', // 非法，不应进入 chain
        createdAt: '2026-06-23T00:00:00.000Z',
      },
    ],
  })
  const parsed = parseStoredEvidenceChain(raw)
  assert.ok(parsed)
  assert.equal(parsed!.items.length, 1)
  assert.equal(parsed!.items[0].evidenceId, 'evi-ok')
})

test('parseStoredEvidenceChain: 缺失 createdAt 给稳定 fallback；metadata 超长字符串被截断', () => {
  const longStr = 'x'.repeat(2_000)
  const raw = JSON.stringify({
    version: 1,
    modelId: 'm',
    generatedAt: '', // 缺失，应 fallback
    items: [
      {
        evidenceId: 'evi-no-time',
        title: 'no time',
        summary: 's',
        evidenceType: 'quality_signal',
        source: 'auto_runner',
        // createdAt 缺失
        metadata: { description: longStr, nested: { a: 1 } },
      },
    ],
  })
  const parsed = parseStoredEvidenceChain(raw)
  assert.ok(parsed)
  const item = parsed!.items[0]
  // createdAt fallback
  assert.equal(item.createdAt, new Date(0).toISOString())
  // generatedAt fallback
  assert.equal(parsed!.generatedAt, new Date(0).toISOString())
  // metadata: description 被截断到 600；嵌套对象被丢，记录 _droppedKeys
  const md = item.metadata as Record<string, unknown>
  assert.equal(typeof md.description, 'string')
  assert.ok((md.description as string).length <= 600)
  assert.equal(md._droppedKeys, 1)
})

test('parseStoredEvidenceChain: 损坏 JSON / 错误 version 不抛错', () => {
  assert.equal(parseStoredEvidenceChain('not-json'), null)
  assert.equal(parseStoredEvidenceChain('{"version":2,"items":[]}'), null)
  assert.equal(parseStoredEvidenceChain(JSON.stringify({ version: 1, items: 'not-array' })), null)
  assert.equal(parseStoredEvidenceChain(JSON.stringify({ version: 1 })), null)
  assert.equal(parseStoredEvidenceChain(null), null)
  assert.equal(parseStoredEvidenceChain(undefined), null)
})

test('loadEvidenceChainFromAnalysis: 缺失 evidenceChain 返回 null，不抛错', () => {
  assert.equal(loadEvidenceChainFromAnalysis(null), null)
  assert.equal(loadEvidenceChainFromAnalysis({}), null)
  assert.equal(loadEvidenceChainFromAnalysis({ evidenceChain: '' }), null)
  assert.equal(loadEvidenceChainFromAnalysis({ evidenceChain: 'invalid-json' }), null)
})

test('groupEvidenceByType: 按固定顺序分组，未知 type 跳过', () => {
  const items: ArtifactEvidence[] = [
    buildEvidence({ modelId: 'm', evidenceType: 'quality_signal', source: 'auto_runner', title: 'Q', summary: 's' }),
    buildEvidence({ modelId: 'm', evidenceType: 'primary_artifact', source: 'auto_runner', title: 'P', summary: 's' }),
    buildEvidence({ modelId: 'm', evidenceType: 'limitation', source: 'auto_runner', title: 'L', summary: 's' }),
  ]
  const groups = groupEvidenceByType(items)
  // 顺序：file_manifest → primary → parsed → structure → quality → candidate → limitations → errors
  // 只保留有内容的组
  assert.equal(groups.length, 3)
  assert.equal(groups[0].key, 'primary')
  assert.equal(groups[1].key, 'quality')
  assert.equal(groups[2].key, 'limitations')
  // 每组内容正确
  assert.equal(groups[0].items[0].title, 'P')
  assert.equal(groups[1].items[0].title, 'Q')
  assert.equal(groups[2].items[0].title, 'L')
})

test('groupEvidenceByType: 空数组返回空数组，不抛错', () => {
  assert.deepEqual(groupEvidenceByType([]), [])
})

test('REPORT_SUMMARY_TYPE_PRIORITY: primary_artifact 优先级最高，file_manifest 最低', () => {
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.primary_artifact < REPORT_SUMMARY_TYPE_PRIORITY.quality_signal)
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.quality_signal < REPORT_SUMMARY_TYPE_PRIORITY.auto_candidate)
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.auto_candidate < REPORT_SUMMARY_TYPE_PRIORITY.parsed_content)
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.parsed_content < REPORT_SUMMARY_TYPE_PRIORITY.limitation)
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.limitation < REPORT_SUMMARY_TYPE_PRIORITY.structure_check)
  assert.ok(REPORT_SUMMARY_TYPE_PRIORITY.structure_check < REPORT_SUMMARY_TYPE_PRIORITY.file_manifest)
})

test('buildEvidenceChainSummaryForReport: 按优先级排序，primary_artifact 排在 file_manifest 前', () => {
  const items: ArtifactEvidence[] = [
    buildEvidence({ modelId: 'm', evidenceType: 'file_manifest', source: 'auto_runner', title: 'manifest', summary: 'long manifest content'.repeat(8), createdAt: '2026-06-23T01:00:00.000Z' }),
    buildEvidence({ modelId: 'm', evidenceType: 'primary_artifact', source: 'auto_runner', title: 'primary', summary: 'primary summary', createdAt: '2026-06-23T02:00:00.000Z' }),
    buildEvidence({ modelId: 'm', evidenceType: 'limitation', source: 'auto_runner', title: 'limit', summary: 'limit summary', createdAt: '2026-06-23T03:00:00.000Z' }),
  ]
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain, { maxChars: 1800 })
  const idxPrimary = summary.indexOf('[primary_artifact]')
  const idxFileManifest = summary.indexOf('[file_manifest]')
  const idxLimitation = summary.indexOf('[limitation]')
  assert.ok(idxPrimary >= 0 && idxFileManifest >= 0 && idxLimitation >= 0)
  assert.ok(idxPrimary < idxLimitation)
  assert.ok(idxPrimary < idxFileManifest)
  assert.ok(idxLimitation < idxFileManifest, 'limitation should still come before file_manifest by priority')
})

test('buildEvidenceChainSummaryForReport: tester_upload / artifact_upload 永不进入', () => {
  const items: ArtifactEvidence[] = [
    // 通过 raw 序列化绕过 builder 类型，让非法 source 能进入测试数据
    // 模拟"如果历史数据里有 tester_upload 也会被拒"
    ...JSON.parse(JSON.stringify([
      { evidenceId: 'evi-tester', modelId: 'm', artifactId: null, runId: null, artifactName: null, evidenceType: 'primary_artifact', source: 'tester_upload', title: 'forbidden tester', summary: 'should not appear', detail: null, metadata: null, createdAt: '2026-06-23T00:00:00.000Z' },
      { evidenceId: 'evi-art', modelId: 'm', artifactId: null, runId: null, artifactName: null, evidenceType: 'quality_signal', source: 'artifact_upload', title: 'forbidden artifact', summary: 'should not appear', detail: null, metadata: null, createdAt: '2026-06-23T00:00:00.000Z' },
    ])),
    buildEvidence({ modelId: 'm', evidenceType: 'quality_signal', source: 'auto_runner', title: 'auto runner OK', summary: 'should appear' }),
  ] as ArtifactEvidence[]
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain)
  assert.match(summary, /auto runner OK/)
  assert.doesNotMatch(summary, /forbidden tester/)
  assert.doesNotMatch(summary, /forbidden artifact/)
})

test('buildEvidenceChainSummaryForReport: file_manifest 单条独立限长，不挤占摘要 token', () => {
  const hugeSummary = '大清单'.repeat(500) // ~1500 chars
  const items: ArtifactEvidence[] = [
    buildEvidence({
      modelId: 'm',
      evidenceType: 'file_manifest',
      source: 'auto_runner',
      title: 'manifest',
      summary: hugeSummary,
    }),
  ]
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain, { maxChars: 1800 })
  // 整段摘要长度不应被 file_manifest 撑爆
  assert.ok(summary.length <= 800, `expected truncated, got ${summary.length}`)
})

test('buildEvidenceChainSummaryForReport: 顶部 banner 永远提示后台候选不等于本地验收', () => {
  const items: ArtifactEvidence[] = [
    buildEvidence({ modelId: 'm', evidenceType: 'primary_artifact', source: 'auto_runner', title: 't', summary: 's' }),
  ]
  const chain = serializeEvidenceChain(items, 'm')
  const summary = buildEvidenceChainSummaryForReport(chain)
  assert.match(summary, /后台候选/)
  assert.match(summary, /测试者本地验收/)
  assert.match(summary, /tester_upload/)
})
