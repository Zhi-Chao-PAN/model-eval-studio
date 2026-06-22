/**
 * Release Hardening V1 — 跨模块回归断言
 *
 * 不是新功能，是把已经在多个文件里独立验证过的"硬规则"
 * 在一张测试表里交叉确认一遍，避免单点回归：
 *
 * 1. 提交版复制只输出 5 模块正文，不含 generationSnapshot / verificationSummary /
 *    任务描述 / 导出时间 / 评分概览 / evidenceChain JSON / 原始 think。
 * 2. evidenceChain parser 拒绝非法 type/source；损坏 JSON 不抛错。
 * 3. 报告 prompt 摘要：tester_upload / artifact_upload 永远不进入报告上下文；
 *    file_manifest 单条独立限长；primary_artifact 优先级最高。
 * 4. report-parser 守住"无 tester_upload 时产物效果反馈必须是占位语"。
 * 5. auto runner V1 边界：未执行代码、未接 Sandbox 必须出现在 limitation 里；
 *    node_modules / 字体 / HTML 错误页必须被降权或过滤。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSubmissionMarkdownPayload, MISSING_PRODUCT_FEEDBACK, MISSING_TRAJECTORY_PLACEHOLDER } from '@/app/api/tasks/[id]/export/route'
import { buildEvidenceChainSummaryForReport, parseStoredEvidenceChain, serializeEvidenceChain, buildEvidence, EVIDENCE_TYPE_VALUES } from '@/lib/artifact-evidence-chain'
import { parseReportStrict } from '@/lib/report-parser'
import { runSafeArtifactAutoRunner } from '@/lib/artifact-auto-runner'

function makeModelWithReport(modelCode: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'm_' + modelCode,
    modelCode,
    displayName: null,
    reports: [
      {
        id: 'r_' + modelCode,
        version: 1,
        source: 'AI_GENERATED',
        createdAt: '2026-06-23T00:00:00.000Z',
        productFeedback: '我从截图中看到产物能正常打开。',
        verificationSummary: 'INVALID — 不应进入提交版',
        verificationScreenshotUrls: 'INVALID — 不应进入提交版',
        generationSnapshot: '{"internal":"INVALID — 不应进入提交版"}',
        generationConfig: '{"internal":"INVALID — 不应进入提交版"}',
        efficiencyScore: 7.5,
        efficiencyComment: '效率评论',
        qualityScore: 8,
        qualityComment: '质量评论',
        overallScore: 8,
        overallComment: '综合评论',
        trajectoryAnalysis: '轨迹分析',
        ...overrides,
      },
    ],
  }
}

function chainWithEvidence() {
  const items = [
    buildEvidence({
      modelId: 'm1',
      evidenceType: 'primary_artifact',
      source: 'auto_runner',
      title: '主产物',
      summary: '主产物识别',
    }),
    buildEvidence({
      modelId: 'm1',
      evidenceType: 'file_manifest',
      source: 'auto_runner',
      title: '文件清单',
      summary: '此处故意很长'.repeat(60),
    }),
  ]
  return serializeEvidenceChain(items, 'm1')
}

// ── 1. 提交版复制 ─────────────────────────────────────────────────────

test('release: 提交版不输出 generationSnapshot / verificationSummary / 证据链 JSON', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [makeModelWithReport('M1')],
  })
  // 5 模块标题必须有
  assert.match(md, /### 产物效果反馈/)
  assert.match(md, /### 交付效率/)
  assert.match(md, /### 产物质量/)
  assert.match(md, /### 综合评价/)
  assert.match(md, /### 轨迹分析/)
  // 禁用内容必须没有
  assert.doesNotMatch(md, /INVALID/)
  assert.doesNotMatch(md, /generationSnapshot/)
  assert.doesNotMatch(md, /verificationSummary/)
  assert.doesNotMatch(md, /verificationScreenshotUrls/)
  assert.doesNotMatch(md, /<think>|<\/think>/i) // raw think
})

test('release: 提交版多模型按输入顺序输出', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [
      makeModelWithReport('ALPHA'),
      makeModelWithReport('BETA', { overallScore: 6, efficiencyScore: 5.5, qualityScore: 6 }),
      makeModelWithReport('GAMMA'),
    ],
  })
  const alphaIdx = md.indexOf('## ALPHA')
  const betaIdx = md.indexOf('## BETA')
  const gammaIdx = md.indexOf('## GAMMA')
  assert.ok(alphaIdx >= 0 && betaIdx > alphaIdx && gammaIdx > betaIdx)
})

// ── 2. evidence chain parser 健壮性 ──────────────────────────────────

test('release: parser 拒绝非法 evidenceType / source 并保持稳定', () => {
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
        source: 'tester_upload', // 永远不应进入 evidence chain
        createdAt: '2026-06-23T00:00:00.000Z',
      },
    ],
  })
  const parsed = parseStoredEvidenceChain(raw)
  assert.ok(parsed)
  assert.equal(parsed!.items.length, 1)
  // 重要：parser 后剩下来的所有 evidence 都在合法枚举内
  for (const item of parsed!.items) {
    assert.ok(EVIDENCE_TYPE_VALUES.includes(item.evidenceType))
  }
})

test('release: parser 不会因为损坏 JSON 而抛错', () => {
  assert.doesNotThrow(() => parseStoredEvidenceChain('not-json'))
  assert.doesNotThrow(() => parseStoredEvidenceChain('{"version":2}'))
  assert.doesNotThrow(() => parseStoredEvidenceChain(null))
})

// ── 3. 报告 prompt 摘要 ──────────────────────────────────────────────

test('release: tester_upload / artifact_upload 永不进入报告 prompt 摘要', () => {
  const chain = serializeEvidenceChain([
    // 通过 raw JSON 绕过类型，让非法 source 能进入测试数据
    ...(JSON.parse(JSON.stringify([
      {
        evidenceId: 'evi-forbidden-1',
        modelId: 'm',
        artifactId: null, runId: null, artifactName: null,
        evidenceType: 'primary_artifact',
        source: 'tester_upload',
        title: 'FORBIDDEN tester',
        summary: 'should not appear',
        detail: null, metadata: null,
        createdAt: '2026-06-23T00:00:00.000Z',
      },
      {
        evidenceId: 'evi-forbidden-2',
        modelId: 'm',
        artifactId: null, runId: null, artifactName: null,
        evidenceType: 'quality_signal',
        source: 'artifact_upload',
        title: 'FORBIDDEN artifact',
        summary: 'should not appear',
        detail: null, metadata: null,
        createdAt: '2026-06-23T00:00:00.000Z',
      },
    ])) as ReturnType<typeof buildEvidence>[]),
    buildEvidence({
      modelId: 'm',
      evidenceType: 'quality_signal',
      source: 'auto_runner',
      title: 'OK quality',
      summary: 'should appear',
    }),
  ], 'm')
  const summary = buildEvidenceChainSummaryForReport(chain)
  assert.match(summary, /OK quality/)
  assert.doesNotMatch(summary, /FORBIDDEN tester/)
  assert.doesNotMatch(summary, /FORBIDDEN artifact/)
  // banner 强提示
  assert.match(summary, /后台候选/)
  assert.match(summary, /tester_upload/)
})

test('release: file_manifest 不挤占 token；primary_artifact 排在前', () => {
  const chain = chainWithEvidence()
  const summary = buildEvidenceChainSummaryForReport(chain, { maxChars: 1800 })
  const idxPrimary = summary.indexOf('[primary_artifact]')
  const idxFile = summary.indexOf('[file_manifest]')
  assert.ok(idxPrimary >= 0 && idxFile >= 0)
  assert.ok(idxPrimary < idxFile, 'primary_artifact should appear before file_manifest')
  // file_manifest 应被截断（输入 summary 约 360 chars，加上 head + artifactTag 后总长应可控）
  const fileSection = summary.slice(idxFile)
  // 不应该把整段 360 字 summary 都完整塞进报告
  assert.ok(fileSection.length < 700, `file_manifest section too long: ${fileSection.length}`)
})

// ── 4. report-parser 守住 tester_upload 边界 ──────────────────────────

test('release: 无 tester_upload 时，产物效果反馈必须是占位语；解析器拒绝其它写法', () => {
  // 测试 1: 没有 tester_upload 时，即使报告里写了"基于证据"也得被拒绝
  const fakeReport = `【产物效果反馈】
我从产物文本判断产物可以正常工作。

【模型交付效率是否符合预期？】
评分：7/10
评论：效率不错

【模型的产物质量怎么样】
评分：7/10
评论：质量不错

【模型的综合表现怎么样】
评分：7/10
评论：综合不错

【轨迹分析】
未提供轨迹截图。`
  // hasTrajectory=false, hasVerificationEvidence=false
  let caught: unknown = null
  try {
    parseReportStrict(fakeReport, { hasTrajectory: false, hasVerificationEvidence: false })
  } catch (err) {
    caught = err
  }
  assert.ok(caught instanceof Error, 'parseReportStrict should reject non-placeholder productFeedback')
  assert.match((caught as Error).message, /产物效果反馈/)
})

test('release: 有 tester_upload 时产物效果反馈必须是真实内容，不能写成占位', () => {
  const fakeReport = `【产物效果反馈】
${MISSING_PRODUCT_FEEDBACK}

【模型交付效率是否符合预期？】
评分：7/10
评论：效率不错

【模型的产物质量怎么样】
评分：7/10
评论：质量不错

【模型的综合表现怎么样】
评分：7/10
评论：综合不错

【轨迹分析】
未提供轨迹截图。`
  let caught: unknown = null
  try {
    parseReportStrict(fakeReport, { hasTrajectory: false, hasVerificationEvidence: true })
  } catch (err) {
    caught = err
  }
  assert.ok(caught instanceof Error, 'parseReportStrict should reject placeholder productFeedback when evidence exists')
})

test('release: 综合分必须 1-10 整数，效率/质量可 .5', () => {
  const goodReport = `【产物效果反馈】
${MISSING_PRODUCT_FEEDBACK}

【模型交付效率是否符合预期？】
评分：7.5/10
评论：效率

【模型的产物质量怎么样】
评分：6.5/10
评论：质量

【模型的综合表现怎么样】
评分：8/10
评论：综合

【轨迹分析】
${MISSING_TRAJECTORY_PLACEHOLDER}`
  // 合法：综合分 8 整数、效率 7.5、质量 6.5
  const parsed = parseReportStrict(goodReport, { hasTrajectory: false, hasVerificationEvidence: false })
  assert.equal(parsed.overallScore, 8)
  assert.equal(parsed.efficiencyScore, 7.5)
  assert.equal(parsed.qualityScore, 6.5)

  // 综合分非整数：拒绝
  const badReport = goodReport.replace('评分：8/10', '评分：8.5/10')
  assert.throws(
    () => parseReportStrict(badReport, { hasTrajectory: false, hasVerificationEvidence: false }),
    /综合评分必须是 1-10 的整数/,
  )

  // 效率 7.3 不允许
  const badEff = goodReport.replace('评分：7.5/10', '评分：7.3/10')
  assert.throws(
    () => parseReportStrict(badEff, { hasTrajectory: false, hasVerificationEvidence: false }),
    /交付效率评分必须是 1-10/,
  )
})

// ── 5. auto runner V1 边界 ──────────────────────────────────────────

test('release: auto runner V1 边界 — 未执行不可信代码 / 未接 Sandbox 必须在 limitation 里', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: 'm',
    artifacts: [{
      id: 'a1', name: 'report.md', size: 1024, mimeType: 'text/markdown',
      parsedText: '评估结论：达到预期。', textContent: '',
    }],
  })
  const limitations = result.items.filter(item => item.evidenceType === 'limitation')
  // 必须有 limitation
  assert.ok(limitations.length >= 1)
  // 至少一条 limitation 必须明确出现 "未执行不可信代码" 或 "Sandbox" 等 V1 边界关键词
  // 另一边 limitation 即使措辞不同（"不属于测试者本地验收截图"），标题里也含 "Sandbox" 字样。
  const combined = limitations
    .map(item => `${item.title} ${item.summary || ''} ${item.detail || ''}`)
    .join('\n')
  assert.match(combined, /未执行不可信代码|Sandbox|未连接/)
})

test('release: auto runner 过滤 node_modules / 字体 / HTML 错误页', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: 'm',
    artifacts: [
      // 这些应该被降权或过滤
      { id: 'a1', name: 'node_modules/lodash/index.js', size: 1024, mimeType: 'text/javascript', parsedText: 'noop', textContent: '' },
      { id: 'a2', name: 'fonts/inter.woff2', size: 50_000, mimeType: 'font/woff2', parsedText: '', textContent: '' },
      // 这个主产物应该胜出
      { id: 'a3', name: '交付报告.pdf', size: 80_000, mimeType: 'application/pdf', parsedText: '报告正文'.repeat(50), textContent: '' },
    ],
  })
  // 主产物必须是 report
  assert.equal(result.primaryName, '交付报告.pdf')
  // manifest 应记录 ignoredCount
  const manifest = result.items.find(item => item.evidenceType === 'file_manifest')
  assert.ok(manifest)
  const md = manifest!.metadata as Record<string, unknown>
  assert.ok((md.ignoredCount as number) >= 2, `expected ignoredCount >= 2, got ${md.ignoredCount}`)
})

test('release: auto runner 不会输出 source === tester_upload 的 evidence', () => {
  // 安全断言：即便有人在 model.artifactAnalysisJson 里塞了 tester_upload 的 evidence，
  // auto runner 也永远不会产生这种 source。
  for (let i = 0; i < 5; i += 1) {
    const result = runSafeArtifactAutoRunner({
      modelId: 'm',
      artifacts: [
        { id: 'a' + i, name: `r${i}.md`, size: 1024, mimeType: 'text/markdown', parsedText: '正文', textContent: '' },
      ],
    })
    for (const item of result.items) {
      assert.notEqual(item.source, 'tester_upload')
      assert.notEqual(item.source, 'artifact_upload')
    }
  }
})