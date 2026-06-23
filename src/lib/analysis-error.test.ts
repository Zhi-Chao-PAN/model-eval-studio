import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampAnalysisError } from './analysis-error'

test('clampAnalysisError: 空字符串返回"未知错误"', () => {
  assert.equal(clampAnalysisError(''), '未知错误')
  assert.equal(clampAnalysisError('   '), '未知错误')
})

test('clampAnalysisError: 正常短字符串原样返回（去除多余空白）', () => {
  assert.equal(clampAnalysisError('AI API 返回超时'), 'AI API 返回超时')
  assert.equal(clampAnalysisError('  多余   空白  \n 行  '), '多余 空白 行')
})

test('clampAnalysisError: 超长字符串截断并加省略号', () => {
  const long = 'x'.repeat(500)
  const out = clampAnalysisError(long)
  assert.ok(out.length <= 241, `should be <= 241 chars, got ${out.length}`)
  assert.ok(out.endsWith('…'))
})

test('clampAnalysisError: HTML 错误页被替换为短提示，避免泄漏 markup', () => {
  const html = '<!DOCTYPE html><html><body>Internal Server Error</body></html>'
  assert.match(clampAnalysisError(html), /请打开浏览器开发者工具/)
  assert.doesNotMatch(clampAnalysisError(html), /DOCTYPE/)
})

test('clampAnalysisError: HTML 片段（含 body 标签）也会触发替换', () => {
  const html = '<body>...<h1>error</h1>...</body>'
  assert.match(clampAnalysisError(html), /请打开浏览器开发者工具/)
})