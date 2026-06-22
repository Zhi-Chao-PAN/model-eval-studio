import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactEntryScore,
  buildLegacyArchivePreview,
  isJunkArtifactText,
  shouldIgnoreArchiveEntry,
} from './artifact-preview'

test('filters hidden fonts and bad downloaded HTML from archives', () => {
  assert.equal(shouldIgnoreArchiveEntry('.fonts/NotoSansSC-Regular.otf'), true)
  assert.equal(shouldIgnoreArchiveEntry('node_modules/pkg/index.js'), true)
  assert.equal(isJunkArtifactText('<html><title>Page not found · GitHub</title></html>'), true)
})
test('ranks a report above implementation support files', () => {
  const report = artifactEntryScore('2026年调薪测算报告.docx', 'document', '报告正文')
  const script = artifactEntryScore('generate_report.py', 'code', 'print("ok")')
  assert.ok(report > script)
})

test('selects the real deliverable from a legacy concatenated zip', () => {
  const text = [
    '=== .fonts/NotoSansSC-Regular.otf ===\n<!doctype html><title>Page not found · GitHub</title>',
    '=== generate_report.py ===\nprint("helper")',
    '=== 2026年下半年全员调薪测算报告及策略白皮书.docx ===\n2026年下半年全员调薪测算报告\n一、执行摘要\n预算与策略',
    '=== 调薪测算结果.csv ===\n姓名,部门,调薪比例\n张三,研发,8%',
  ].join('\n\n')
  const preview = buildLegacyArchivePreview('deliverables.zip', text)
  assert.equal(preview?.primaryName, '2026年下半年全员调薪测算报告及策略白皮书.docx')
  assert.equal(preview?.primaryKind, 'document')
  assert.equal(preview?.entries?.some(entry => entry.name.includes('.fonts')), false)
})

test('blocks zip-slip path-traversal entries (../ and absolute paths)', () => {
  // Classic zip-slip
  assert.equal(shouldIgnoreArchiveEntry('../../../etc/passwd'), true)
  assert.equal(shouldIgnoreArchiveEntry('subdir/../../malicious.sh'), true)
  // Backslash variant
  assert.equal(shouldIgnoreArchiveEntry('..\\..\\Windows\\System32\\cmd.exe'), true)
  // Absolute paths
  assert.equal(shouldIgnoreArchiveEntry('/etc/passwd'), true)
  assert.equal(shouldIgnoreArchiveEntry('/var/log/evil'), true)
  // Windows drive letters
  assert.equal(shouldIgnoreArchiveEntry('C:\\Windows\\System32\\drivers\\etc\\hosts'), true)
  assert.equal(shouldIgnoreArchiveEntry('D:/malware.exe'), true)
  // Null-byte injection
  assert.equal(shouldIgnoreArchiveEntry('report.pdf\x00.exe'), true)
  // Normal nested entries are still allowed
  assert.equal(shouldIgnoreArchiveEntry('src/main.py'), false)
  assert.equal(shouldIgnoreArchiveEntry('deliverables/report.docx'), false)
  assert.equal(shouldIgnoreArchiveEntry('README.md'), false)
})
