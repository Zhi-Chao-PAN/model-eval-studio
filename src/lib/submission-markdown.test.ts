import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSubmissionMarkdownPayload,
  SUBMISSION_SECTION_TITLES,
  MISSING_PRODUCT_FEEDBACK,
  MISSING_TRAJECTORY_PLACEHOLDER,
} from '@/app/api/tasks/[id]/export/route'

function modelWithReport(modelCode: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'm_' + modelCode,
    modelCode,
    displayName: null,
    reports: [
      {
        id: 'r_' + modelCode,
        version: 1,
        source: 'AI_GENERATED',
        createdAt: '2026-06-22T00:00:00Z',
        productFeedback: '我从截图中看到产物能正常打开。',
        verificationSummary: '不该出现在提交版里',
        efficiencyScore: 8.5,
        efficiencyComment: '效率评论',
        qualityScore: 7,
        qualityComment: '质量评论',
        overallScore: 9,
        overallComment: '综合评论',
        trajectoryAnalysis: '轨迹分析正文',
        ...overrides,
      },
    ],
  }
}

test('buildSubmissionMarkdownPayload: 标题为模型名 + 五模块（中文 UI 标题）', () => {
  const md = buildSubmissionMarkdownPayload({ models: [modelWithReport('VORTEX')] })
  assert.match(md, /^## VORTEX/)
  for (const title of Object.values(SUBMISSION_SECTION_TITLES)) {
    assert.match(md, new RegExp(`### ${title}`), `应包含模块标题：${title}`)
  }
})

test('buildSubmissionMarkdownPayload: 不含任务标题/任务描述/导出时间/评分概览表/验证说明', () => {
  const md = buildSubmissionMarkdownPayload({
    title: '任务标题-不应出现',
    description: '任务描述-不应出现',
    createdAt: '2026-06-22T00:00:00Z',
    models: [modelWithReport('VORTEX')],
  })
  assert.doesNotMatch(md, /任务标题-不应出现/)
  assert.doesNotMatch(md, /任务描述-不应出现/)
  assert.doesNotMatch(md, /导出时间/)
  assert.doesNotMatch(md, /评分概览/)
  assert.doesNotMatch(md, /不该出现在提交版里/) // verificationSummary
  assert.doesNotMatch(md, /generationSnapshot/)
  assert.doesNotMatch(md, /\|\s*---\s*\|\s*---/i) // markdown 表格分隔
  assert.doesNotMatch(md, /^(# |> )/m) // 不出现顶级 h1 / blockquote 引导
})

test('buildSubmissionMarkdownPayload: 综合分显示为整数，效率/质量允许 .5', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{
      id: 'm1', modelCode: 'A', displayName: null,
      reports: [{
        productFeedback: '反馈',
        efficiencyScore: 6.5,
        efficiencyComment: '效率',
        qualityScore: 7.5,
        qualityComment: '质量',
        overallScore: 9,
        overallComment: '综合',
        trajectoryAnalysis: '轨迹',
      }],
    }],
  })
  assert.match(md, /### 交付效率[\s\S]*?评分：6\.5\/10/)
  assert.match(md, /### 产物质量[\s\S]*?评分：7\.5\/10/)
  assert.match(md, /### 综合评价[\s\S]*?评分：9\/10/)
})

test('buildSubmissionMarkdownPayload: 综合分非整数 / 超界被规范化为整数 1-10', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{
      id: 'm1', modelCode: 'A', displayName: null,
      reports: [{
        productFeedback: '反馈',
        efficiencyScore: 7,
        efficiencyComment: 'e',
        qualityScore: 7,
        qualityComment: 'q',
        overallScore: 9.7, // 四舍五入到 10
        overallComment: 'o',
        trajectoryAnalysis: 't',
      }],
    }],
  })
  assert.match(md, /### 综合评价[\s\S]*?评分：10\/10/)
})

test('buildSubmissionMarkdownPayload: 缺轨迹时输出"未提供轨迹截图。"占位', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{
      id: 'm1', modelCode: 'A', displayName: null,
      reports: [{
        productFeedback: '反馈',
        efficiencyScore: 7,
        efficiencyComment: 'e',
        qualityScore: 7,
        qualityComment: 'q',
        overallScore: 8,
        overallComment: 'o',
        trajectoryAnalysis: null,
      }],
    }],
  })
  assert.match(md, new RegExp(`### ${SUBMISSION_SECTION_TITLES.trajectory}[\\s\\S]*?${MISSING_TRAJECTORY_PLACEHOLDER}`))
})

test('buildSubmissionMarkdownPayload: 缺产物效果截图时不编造产物效果反馈', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{
      id: 'm1', modelCode: 'A', displayName: null,
      reports: [{
        productFeedback: null,
        efficiencyScore: 7,
        efficiencyComment: 'e',
        qualityScore: 7,
        qualityComment: 'q',
        overallScore: 8,
        overallComment: 'o',
        trajectoryAnalysis: MISSING_TRAJECTORY_PLACEHOLDER,
      }],
    }],
  })
  assert.match(md, new RegExp(`### ${SUBMISSION_SECTION_TITLES.product}[\\s\\S]*?${MISSING_PRODUCT_FEEDBACK}`))
})

test('buildSubmissionMarkdownPayload: 多模型按顺序输出，不混入任务级内容', () => {
  const md = buildSubmissionMarkdownPayload({
    title: '任务A',
    description: '描述',
    models: [
      modelWithReport('A1'),
      modelWithReport('A2', { overallScore: 6, efficiencyScore: 5.5, qualityScore: 6 }),
    ],
  })
  const firstIdx = md.indexOf('## A1')
  const secondIdx = md.indexOf('## A2')
  assert.ok(firstIdx >= 0 && secondIdx > firstIdx, '应按模型顺序输出')
  assert.doesNotMatch(md, /任务A/)
  assert.doesNotMatch(md, /描述/)
})

test('buildSubmissionMarkdownPayload: 没有报告的模型给出明确占位', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{ id: 'm1', modelCode: 'A', displayName: null, reports: [] }],
  })
  assert.match(md, /## A[\s\S]*?\*暂无评估报告\*/)
})

test('buildSubmissionMarkdownPayload: 使用 displayName 作为标题（无 displayName 则用 modelCode）', () => {
  const md = buildSubmissionMarkdownPayload({
    models: [{
      id: 'm1', modelCode: 'VORTEX', displayName: 'Vortex-Pro',
      reports: [{
        productFeedback: '反馈',
        efficiencyScore: 7,
        efficiencyComment: 'e',
        qualityScore: 7,
        qualityComment: 'q',
        overallScore: 8,
        overallComment: 'o',
        trajectoryAnalysis: 't',
      }],
    }],
  })
  assert.match(md, /^## Vortex-Pro/)
  assert.doesNotMatch(md, /^## VORTEX/m)
})