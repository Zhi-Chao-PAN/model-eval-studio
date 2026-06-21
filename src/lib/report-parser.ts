export type ParsedModelReport = {
  productFeedback: string
  overallScore: number
  overallComment: string
  efficiencyScore: number
  efficiencyComment: string
  qualityScore: number
  qualityComment: string
  trajectoryAnalysis: string
}

export type ReportTextLike = {
  productFeedback?: string | null
  overallScore?: number | null
  overallComment?: string | null
  efficiencyScore?: number | null
  efficiencyComment?: string | null
  qualityScore?: number | null
  qualityComment?: string | null
  trajectoryAnalysis?: string | null
}

export type ReportParseOptions = {
  hasTrajectory: boolean
  hasVerificationEvidence: boolean
}

type SectionKey = 'product' | 'efficiency' | 'quality' | 'overall' | 'trajectory'

type SectionDefinition = {
  key: SectionKey
  label: string
  markers: string[]
}

type LocatedSection = {
  key: SectionKey
  marker: string
  index: number
  content: string
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: 'product', label: '产物效果反馈', markers: ['【产物效果反馈】'] },
  {
    key: 'efficiency',
    label: '交付效率',
    markers: ['【模型交付效率是否符合预期？】', '【交付效率】', '【模型交付效率】'],
  },
  {
    key: 'quality',
    label: '产物质量',
    markers: ['【模型的产物质量怎么样】', '【产物质量】', '【模型产物质量】'],
  },
  {
    key: 'overall',
    label: '综合评价',
    markers: ['【模型的综合表现怎么样】', '【综合评价】', '【综合表现】'],
  },
  { key: 'trajectory', label: '轨迹分析', markers: ['【轨迹分析】'] },
]

export class ReportParseError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`评估报告结构不合格：${issues.join('；')}`)
    this.name = 'ReportParseError'
    this.issues = issues
  }
}

function locateMarker(text: string, definition: SectionDefinition): Omit<LocatedSection, 'content'> | null {
  let best: Omit<LocatedSection, 'content'> | null = null
  for (const marker of definition.markers) {
    const index = text.indexOf(marker)
    if (index !== -1 && (!best || index < best.index)) {
      best = { key: definition.key, marker, index }
    }
  }
  return best
}

function locateSections(text: string): { sections: Partial<Record<SectionKey, LocatedSection>>; issues: string[] } {
  const issues: string[] = []
  const located = SECTION_DEFINITIONS.map((definition) => {
    const marker = locateMarker(text, definition)
    if (!marker) issues.push(`缺少【${definition.label}】模块`)
    return marker
  })

  const present = located.filter((section): section is Omit<LocatedSection, 'content'> => Boolean(section))
  for (let index = 1; index < present.length; index += 1) {
    if (present[index].index <= present[index - 1].index) {
      issues.push('报告模块顺序不正确')
      break
    }
  }

  const sections: Partial<Record<SectionKey, LocatedSection>> = {}
  for (let index = 0; index < present.length; index += 1) {
    const current = present[index]
    const next = present[index + 1]
    sections[current.key] = {
      ...current,
      content: text.slice(current.index + current.marker.length, next?.index).trim(),
    }
  }
  return { sections, issues }
}

function extractScore(section: string): number | null {
  const match = section.match(/评分[：:\s]*([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return null
  const score = Number(match[1])
  return Number.isFinite(score) ? score : null
}

function cleanComment(section: string): string {
  return section
    .replace(/评分[：:\s]*([0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*10)?\s*/g, '')
    .replace(/^评论[：:\s]*/m, '')
    .trim()
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '')
}

function isHalfStepScore(score: number): boolean {
  return Number.isFinite(score) &&
    score >= 1 &&
    score <= 10 &&
    Math.abs(score * 2 - Math.round(score * 2)) < 0.00001
}

function isIntegerScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 10
}

function sectionContent(
  sections: Partial<Record<SectionKey, LocatedSection>>,
  key: SectionKey,
): string {
  return sections[key]?.content.trim() || ''
}

function sectionScore(
  sections: Partial<Record<SectionKey, LocatedSection>>,
  key: SectionKey,
): number | null {
  const section = sections[key]?.content || ''
  return extractScore(section)
}

export function parseReportStrict(text: string, options: ReportParseOptions): ParsedModelReport {
  const { sections, issues } = locateSections(text)

  const productFeedback = sectionContent(sections, 'product')
  const efficiencyScore = sectionScore(sections, 'efficiency')
  const efficiencyComment = cleanComment(sectionContent(sections, 'efficiency'))
  const qualityScore = sectionScore(sections, 'quality')
  const qualityComment = cleanComment(sectionContent(sections, 'quality'))
  const overallScore = sectionScore(sections, 'overall')
  const overallComment = cleanComment(sectionContent(sections, 'overall'))
  const trajectoryAnalysis = sectionContent(sections, 'trajectory')

  if (!productFeedback) {
    issues.push('产物效果反馈不能为空')
  } else if (options.hasVerificationEvidence) {
    if (/未上传产物效果截图|暂无法填写产物效果反馈|暂不能生成/.test(productFeedback)) {
      issues.push('已提供产物效果截图时，产物效果反馈不能写成未上传截图')
    }
  } else if (!/未上传产物效果截图/.test(productFeedback)) {
    issues.push('未提供产物效果截图时，产物效果反馈只能标记为待补齐')
  }

  if (efficiencyScore === null || !isHalfStepScore(efficiencyScore)) {
    issues.push('交付效率评分必须是 1-10 的整数或 .5 分')
  }
  if (!efficiencyComment) issues.push('交付效率评论不能为空')

  if (qualityScore === null || !isHalfStepScore(qualityScore)) {
    issues.push('产物质量评分必须是 1-10 的整数或 .5 分')
  }
  if (!qualityComment) issues.push('产物质量评论不能为空')

  if (overallScore === null || !isIntegerScore(overallScore)) {
    issues.push('综合评分必须是 1-10 的整数')
  }
  if (!overallComment) issues.push('综合评价评论不能为空')

  if (options.hasTrajectory) {
    if (!trajectoryAnalysis || normalizeText(trajectoryAnalysis) === '未提供轨迹截图。') {
      issues.push('已提供轨迹时，轨迹分析不能留空或写未提供')
    }
  } else if (normalizeText(trajectoryAnalysis) !== '未提供轨迹截图。') {
    issues.push('未提供轨迹时，轨迹分析必须写“未提供轨迹截图。”')
  }

  if (issues.length > 0) throw new ReportParseError([...new Set(issues)])

  return {
    productFeedback,
    overallScore: overallScore as number,
    overallComment,
    efficiencyScore: efficiencyScore as number,
    efficiencyComment,
    qualityScore: qualityScore as number,
    qualityComment,
    trajectoryAnalysis,
  }
}

export function formatIntegerScore(score: number): string {
  return String(Math.min(10, Math.max(1, Math.round(score))))
}

export function formatHalfScore(score: number): string {
  const normalized = Math.min(10, Math.max(1, Math.round(score * 2) / 2))
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1)
}

export function formatReportText(modelCode: string, report: ReportTextLike): string {
  return `====================================
评估对象：${modelCode}
====================================

【产物效果反馈】
${report.productFeedback || ''}

【模型交付效率是否符合预期？】
评分：${formatHalfScore(report.efficiencyScore ?? 1)} / 10
评论：${report.efficiencyComment || ''}

【模型的产物质量怎么样】
评分：${formatHalfScore(report.qualityScore ?? 1)} / 10
评论：${report.qualityComment || ''}

【模型的综合表现怎么样】
评分：${formatIntegerScore(report.overallScore ?? 1)} / 10
评论：${report.overallComment || ''}

【轨迹分析】
${report.trajectoryAnalysis || '未提供轨迹截图。'}
`
}
