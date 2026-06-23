import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  runSafeArtifactAutoRunner,
  type AutoRunnerArtifact,
} from './artifact-auto-runner'

const MODEL_ID = 'model-test'

function artifact(overrides: Partial<AutoRunnerArtifact>): AutoRunnerArtifact {
  return {
    id: overrides.id || `art-${Math.random().toString(36).slice(2, 7)}`,
    name: overrides.name || 'unnamed.txt',
    size: overrides.size ?? 1024,
    mimeType: overrides.mimeType ?? 'text/plain',
    parsedText: overrides.parsedText ?? '',
    textContent: overrides.textContent ?? '',
  }
}

test('runSafeArtifactAutoRunner: 空产物输出 limitation 证据且无主产物', () => {
  const result = runSafeArtifactAutoRunner({ modelId: MODEL_ID, artifacts: [] })
  assert.equal(result.hasUsablePrimary, false)
  assert.equal(result.primaryName, null)
  assert.ok(result.items.length >= 2)
  // 必须显式声明"无产物 + V1 边界"两条 limitation
  const limitations = result.items.filter(item => item.evidenceType === 'limitation')
  assert.ok(limitations.length >= 2)
  assert.ok(limitations.some(item => /没有产物|尚未上传/.test(item.summary)))
  assert.ok(limitations.some(item => {
    const detail = item.detail || ''
    return /未执行不可信代码|Sandbox/.test(detail)
      || /未执行不可信代码|Sandbox/.test(item.summary)
      || /未执行不可信代码|Sandbox/.test(item.title)
  }))
})

test('runSafeArtifactAutoRunner: 单 README + package.json + 入口 会被识别为典型工程', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({ id: 'a1', name: 'README.md', parsedText: '项目说明：用于评测 demo。' }),
      artifact({ id: 'a2', name: 'package.json', parsedText: '{"name":"demo"}' }),
      artifact({ id: 'a3', name: 'index.ts', parsedText: 'export const hello = 1' }),
    ],
  })
  assert.equal(result.hasUsablePrimary, true)
  // 主产物应是 README 或 package.json（评分更高）
  assert.ok(result.primaryName)
  // 结构信号应当包含 3 项
  const structure = result.items.find(item => item.evidenceType === 'structure_check')
  assert.ok(structure)
  const meta = structure!.metadata as Record<string, unknown>
  assert.equal(meta.hasReadme, true)
  assert.equal(meta.hasManifest, true)
  assert.equal(meta.hasEntry, true)
})

test('runSafeArtifactAutoRunner: 报告类 PDF 优先成为主产物', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({ id: 'a1', name: 'index.js', parsedText: 'console.log(1)', size: 100 }),
      artifact({ id: 'a2', name: '交付报告.pdf', parsedText: '第一段总结内容。'.repeat(50), size: 80_000 }),
    ],
  })
  assert.equal(result.primaryName, '交付报告.pdf')
})

test('runSafeArtifactAutoRunner: HTML 错误页被识别为不可用主产物', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({
        id: 'a1',
        name: 'index.html',
        parsedText: '<!DOCTYPE html><html><body>500 Internal Server Error</body></html>',
      }),
      artifact({ id: 'a2', name: 'README.md', parsedText: '一句话说明' }),
    ],
  })
  // 即使有 README，但只有一句；主产物应落入 README（因为 HTML 错误页被过滤）
  assert.equal(result.primaryName, 'README.md')
})

test('runSafeArtifactAutoRunner: 字体、node_modules 文件被降权 / 计入过滤数', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({ id: 'a1', name: 'node_modules/lodash/index.js', parsedText: 'noop', size: 1024 }),
      artifact({ id: 'a2', name: 'fonts/inter.woff2', parsedText: '', size: 50_000 }),
      artifact({ id: 'a3', name: 'report.md', parsedText: '评估报告\n\n第一章 概述' }),
    ],
  })
  // 报告应该是主产物
  assert.equal(result.primaryName, 'report.md')
  // manifest 中应包含 ignoredCount >= 2
  const manifest = result.items.find(item => item.evidenceType === 'file_manifest')
  assert.ok(manifest)
  const meta = manifest!.metadata as Record<string, unknown>
  assert.ok((meta.ignoredCount as number) >= 2)
})

test('runSafeArtifactAutoRunner: 只上传图片时结构信号明确 onlyImages=true', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({ id: 'a1', name: 'screenshot1.png', parsedText: '', size: 20_000 }),
      artifact({ id: 'a2', name: 'screenshot2.png', parsedText: '', size: 20_000 }),
    ],
  })
  const structure = result.items.find(item => item.evidenceType === 'structure_check')
  assert.ok(structure)
  const meta = structure!.metadata as Record<string, unknown>
  assert.equal(meta.onlyImages, true)
  // 没有 parsed_content 证据（因为没有可解析文本）
  assert.equal(
    result.items.find(item => item.evidenceType === 'parsed_content'),
    undefined,
  )
  // 但仍可能有 primary_artifact（PNG 本身可以作主产物）
  const quality = result.items.find(item => item.evidenceType === 'quality_signal')
  assert.ok(quality)
  const qmeta = quality!.metadata as Record<string, unknown>
  assert.equal(qmeta.onlyImages, true)
})

test('runSafeArtifactAutoRunner: 输出始终包含 limitation 说明 V1 边界', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [artifact({ id: 'a1', name: 'report.md', parsedText: '内容' })],
  })
  const limitations = result.items.filter(item => item.evidenceType === 'limitation')
  assert.ok(limitations.length >= 1)
  for (const item of limitations) {
    assert.match(item.summary, /未执行不可信代码|Sandbox|未连接/)
  }
})

test('runSafeArtifactAutoRunner: auto_candidate 摘要可被报告 prompt 引用', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [artifact({ id: 'a1', name: 'report.md', parsedText: '评估结论：达到预期。' })],
  })
  const candidate = result.items.find(item => item.evidenceType === 'auto_candidate')
  assert.ok(candidate)
  // 摘要要么明确写"候选证据摘要"，要么至少引用了主产物名。
  assert.ok(/候选证据摘要/.test(candidate!.summary) || /report\.md/.test(candidate!.summary))
  // 且要能被报告生成看到：source 必须是 auto_runner / parser / analysis_runtime
  assert.equal(candidate!.source, 'auto_runner')
})

test('runSafeArtifactAutoRunner: 不包含 tester_upload 来源证据', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [artifact({ id: 'a1', name: 'report.md', parsedText: '评估' })],
  })
  // 自动验收运行器永远不输出 source === 'artifact_upload'（那是用户上传的产物本身）
  // 也不直接伪造 tester_upload；产物效果截图来源仍由 verification-evidence 控制。
  for (const item of result.items) {
    assert.notEqual(item.source, 'artifact_upload')
  }
})

test('runSafeArtifactAutoRunner: 全 HTML 错误页场景返回 limitation', () => {
  const result = runSafeArtifactAutoRunner({
    modelId: MODEL_ID,
    artifacts: [
      artifact({ id: 'a1', name: 'page1.html', parsedText: '<!DOCTYPE html><body>404 not found</body>' }),
      artifact({ id: 'a2', name: 'page2.html', parsedText: '<html><body>oops</body></html>' }),
    ],
  })
  assert.equal(result.primaryName, null)
  assert.equal(result.hasUsablePrimary, false)
})