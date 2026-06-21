import assert from 'node:assert/strict'
import test from 'node:test'
import { ReportParseError, parseReportStrict } from './report-parser'

const validReport = `====================================
评估对象：VORTEX
====================================

【产物效果反馈】
我打开了产物截图中展示的报告正文，可以看到核心内容已经成稿，但表格部分仍有格式问题。

【模型交付效率是否符合预期？】
评分：7.5 / 10
评论：交付速度基本符合预期，过程里有少量重复尝试。

【模型的产物质量怎么样】
评分：8 / 10
评论：产物主体完整，结构清晰，但细节校验还不够充分。

【模型的综合表现怎么样】
评分：8 / 10
评论：整体可用，主要目标完成较好，仍有提升空间。

【轨迹分析】
未提供轨迹截图。`

test('parses a valid report with half-step efficiency and quality scores', () => {
  const parsed = parseReportStrict(validReport, {
    hasTrajectory: false,
    hasVerificationEvidence: true,
  })

  assert.equal(parsed.efficiencyScore, 7.5)
  assert.equal(parsed.qualityScore, 8)
  assert.equal(parsed.overallScore, 8)
})

test('rejects missing product evidence text when no acceptance screenshot is provided', () => {
  assert.throws(
    () => parseReportStrict(validReport, {
      hasTrajectory: false,
      hasVerificationEvidence: false,
    }),
    ReportParseError,
  )
})

test('accepts the explicit pending product-feedback placeholder without evidence', () => {
  const report = validReport.replace(
    '我打开了产物截图中展示的报告正文，可以看到核心内容已经成稿，但表格部分仍有格式问题。',
    '未上传产物效果截图，暂无法填写产物效果反馈。',
  )

  const parsed = parseReportStrict(report, {
    hasTrajectory: false,
    hasVerificationEvidence: false,
  })
  assert.equal(parsed.productFeedback, '未上传产物效果截图，暂无法填写产物效果反馈。')
})

test('rejects non-integer overall scores', () => {
  assert.throws(
    () => parseReportStrict(validReport.replace('评分：8 / 10\n评论：整体可用', '评分：8.5 / 10\n评论：整体可用'), {
      hasTrajectory: false,
      hasVerificationEvidence: true,
    }),
    /综合评分必须是 1-10 的整数/,
  )
})

test('rejects reports with missing sections instead of silently saving defaults', () => {
  assert.throws(
    () => parseReportStrict('【产物效果反馈】\n只有一段文字', {
      hasTrajectory: false,
      hasVerificationEvidence: true,
    }),
    /缺少【交付效率】模块/,
  )
})
