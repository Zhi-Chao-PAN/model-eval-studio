/**
 * 评测评分模板与评分规则定义
 *
 * 提供 CODING 和 AGENT 两种预设模板，
 * 以及 rubric 的类型定义、校验和 prompt 生成工具。
 */

export interface RubricDimension {
  key: string
  label: string
  weight: number // 权重（总分 10 分内的占比）
  description: string // 维度说明
  scoreRange: [number, number] // 评分范围 [min, max]
  scoreGuide?: Record<string, string> // 分数档位说明
}

export interface RubricData {
  templateType: 'CODING' | 'AGENT' | 'CUSTOM'
  dimensions: RubricDimension[]
  overallFormula: string
}

// ========== CODING 模板（5+3+2 公式 + 封顶规则） ==========

const CODING_DIMENSIONS: RubricDimension[] = [
  {
    key: 'requirementCompletion',
    label: '需求完成度',
    weight: 5,
    description: '决定「能不能用」——核心需求是否满足、主流程是否顺畅、边界场景是否覆盖',
    scoreRange: [0, 5],
    scoreGuide: {
      '5': '核心需求全部满足；主流程顺畅；边界/异常场景也基本覆盖；交付可直接用',
      '4': '核心需求满足；有少量非关键缺口或小 Bug，但不影响主流程',
      '3': '主流程勉强跑通；缺关键细节/验收点；需要手动补救才能用',
      '2': '只完成一部分；核心验收点没过或经常出错',
      '1': '接近跑偏；和需求匹配度很低',
      '0': '未交付有效结果/不可运行/完全不相关',
    },
  },
  {
    key: 'codeQuality',
    label: '代码质量',
    weight: 3,
    description: '决定「敢不敢合、好不好维护」——结构清晰、改动克制、命名合理、无安全/性能坑',
    scoreRange: [0, 3],
    scoreGuide: {
      '3': '结构清晰；改动克制；命名/边界处理合理；无明显安全/性能坑；有必要的测试或自检手段',
      '2': '整体可维护；有些瑕疵（重复、轻微坏味道、类型/异常处理一般），但风险可控',
      '1': '能用但明显脆弱（硬编码、耦合重、缺关键校验、潜在回归点多）',
      '0': '明显不安全/高风险/不可维护',
    },
  },
  {
    key: 'trajectoryQuality',
    label: '轨迹质量',
    weight: 2,
    description: '决定「过程是否可信、可复用、可协作」——步骤可复现、解释取舍、工具有效、有验证闭环',
    scoreRange: [0, 2],
    scoreGuide: {
      '2': '步骤可复现；会先澄清关键不确定点；解释取舍；工具/命令使用克制且安全；有验证闭环',
      '1': '过程基本顺；但有跳步、解释不足、偶尔走弯路或验证不充分',
      '0': '过程混乱或不可信（编造结果、未验证却宣称完成、反复无效尝试、忽略关键风险/约束）',
    },
  },
]

const CODING_FORMULA =
  '综合评分 = 需求完成度 + 代码质量 + 轨迹质量（满分 10 分）。' +
  '封顶规则：核心需求未完成不超过 6 分，结果不可运行/无法验证且无修复指引不超过 4 分，明显跑题不超过 2 分。'

// ========== AGENT 模板（6 维度加权，满分 10 分） ==========

const AGENT_DIMENSIONS: RubricDimension[] = [
  {
    key: 'instructionFollowing',
    label: '指令理解与遵循度',
    weight: 2.5,
    description: 'Agent 是否准确理解并完成了用户的意图？是否遵循了所有指令中的约束和要求？',
    scoreRange: [0, 2.5],
    scoreGuide: {
      '2.5': '完全准确理解用户意图；所有约束条件均遵守；交付物完全符合要求',
      '2': '准确理解主要意图；绝大部分约束遵守；交付物基本符合要求',
      '1.5': '理解主要意图但有偏差；部分约束未遵守；交付物有明显缺漏',
      '1': '理解有较大偏差；多个重要约束未遵守；交付物不完整',
      '0.5': '严重偏离意图；基本未遵守指令；交付物几乎无法使用',
      '0': '完全未理解或未执行指令；交付物与要求无关',
    },
  },
  {
    key: 'planningAbility',
    label: '规划能力',
    weight: 2,
    description: '是否有合理的任务拆解和执行规划？步骤是否清晰、有条理？',
    scoreRange: [0, 2],
    scoreGuide: {
      '2': '任务拆解清晰合理；执行步骤有序；能根据中间结果动态调整策略；最终路径高效',
      '1.5': '拆解基本合理；步骤大体有序；偶有冗余但整体方向正确',
      '1': '拆解不够清晰；步骤有些混乱；存在明显冗余或遗漏',
      '0.5': '缺乏有效规划；执行过程混乱；频繁走弯路或重复劳动',
      '0': '无规划能力；随机尝试；完全无法推进任务',
    },
  },
  {
    key: 'toolUsage',
    label: '工具调用',
    weight: 1.5,
    description: '工具使用是否正确、高效？有没有滥用或无效调用？',
    scoreRange: [0, 1.5],
    scoreGuide: {
      '1.5': '工具选择精准；调用参数正确；无冗余调用；能组合工具完成复杂操作',
      '1': '工具选择基本正确；偶有参数错误但能自行修正；调用次数合理',
      '0.5': '工具选择有误或参数频繁出错；有较多冗余调用；需多次尝试才能成功',
      '0': '无法正确使用工具；反复无效调用；或完全不使用必要工具',
    },
  },
  {
    key: 'reasoning',
    label: '推理与判断',
    weight: 1.5,
    description: '推理过程是否合理？有没有陷入死循环？是否做出了正确的判断？',
    scoreRange: [0, 1.5],
    scoreGuide: {
      '1.5': '推理严密准确；判断合理；遇到错误能正确诊断并修正；不会陷入死循环',
      '1': '推理基本正确；偶有小错但能自我纠正；整体判断方向对',
      '0.5': '推理有明显漏洞；判断有时错误；偶有陷入循环但能跳出',
      '0': '推理混乱；频繁做出错误判断；陷入死循环无法自拔',
    },
  },
  {
    key: 'hallucination',
    label: '幻觉检测',
    weight: 1.5,
    description: '是否出现严重的幻觉（胡编乱造、虚构事实、编造结果）？',
    scoreRange: [0, 1.5],
    scoreGuide: {
      '1.5': '完全没有幻觉；所有陈述都有事实依据；准确描述观察到的结果',
      '1': '偶有轻微不准确但不影响结论；没有编造关键事实',
      '0.5': '有明显幻觉；编造部分事实或结果；但核心结论未受严重影响',
      '0': '严重幻觉；大量编造不存在的结果/事实；结论完全不可信',
    },
  },
  {
    key: 'deliveryQuality',
    label: '交付结果',
    weight: 1,
    description: '最终交付物是否符合要求？质量如何？',
    scoreRange: [0, 1],
    scoreGuide: {
      '1': '最终交付物完整、正确、格式规范；可直接使用',
      '0.5': '交付物基本可用但有瑕疵；格式或完整性有待改进',
      '0': '交付物不完整、错误严重或完全不符合要求',
    },
  },
]

const AGENT_FORMULA =
  '综合评分 = 指令遵循(2.5) + 规划能力(2) + 工具调用(1.5) + 推理判断(1.5) + 幻觉检测(1.5) + 交付结果(1) = 满分 10 分。'

// ========== 预设模板导出 ==========

export const CODING_RUBRIC: RubricData = {
  templateType: 'CODING',
  dimensions: CODING_DIMENSIONS,
  overallFormula: CODING_FORMULA,
}

export const AGENT_RUBRIC: RubricData = {
  templateType: 'AGENT',
  dimensions: AGENT_DIMENSIONS,
  overallFormula: AGENT_FORMULA,
}

export const PRESET_TEMPLATES: Array<{
  key: 'CODING' | 'AGENT'
  name: string
  description: string
  rubric: RubricData
}> = [
  {
    key: 'CODING',
    name: '代码开发评测',
    description: '适用于代码开发、Bug 修复、功能实现等编程任务，采用需求完成度+代码质量+轨迹质量的 5+3+2 评分体系。',
    rubric: CODING_RUBRIC,
  },
  {
    key: 'AGENT',
    name: 'Agent 智能体评测',
    description: '适用于 Agent 智能体任务，从指令遵循、规划能力、工具调用、推理判断、幻觉检测、交付结果六个维度加权评分。',
    rubric: AGENT_RUBRIC,
  },
]

/** 根据任务类型获取默认 rubric */
export function getDefaultRubric(taskType: string | null | undefined): RubricData {
  if (taskType === 'AGENT') return AGENT_RUBRIC
  return CODING_RUBRIC
}

/** 校验 rubric 数据合法性 */
export function validateRubric(data: unknown): { valid: boolean; error?: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, error: 'rubric 必须是对象' }
  }
  const d = data as Record<string, unknown>
  if (typeof d.templateType !== 'string' || !['CODING', 'AGENT', 'CUSTOM'].includes(d.templateType)) {
    return { valid: false, error: 'templateType 必须是 CODING / AGENT / CUSTOM' }
  }
  if (!Array.isArray(d.dimensions) || d.dimensions.length === 0 || d.dimensions.length > 20) {
    return { valid: false, error: 'dimensions 必须为 1-20 项的非空数组' }
  }
  if (typeof d.overallFormula !== 'string' || d.overallFormula.trim().length === 0) {
    return { valid: false, error: 'overallFormula 必填' }
  }
  if (d.overallFormula.length > 2000) {
    return { valid: false, error: 'overallFormula 过长（最多 2000 字符）' }
  }

  let totalWeight = 0
  const keys = new Set<string>()
  for (const dim of d.dimensions) {
    if (typeof dim !== 'object' || dim === null || Array.isArray(dim)) {
      return { valid: false, error: '每个维度必须是对象' }
    }
    const d2 = dim as Record<string, unknown>
    if (typeof d2.key !== 'string' || !d2.key.trim()) {
      return { valid: false, error: '每个维度必须有 key' }
    }
    if (!/^[a-z][a-z0-9_]{0,31}$/i.test(d2.key)) {
      return { valid: false, error: '维度 key 必须是 1-32 位字母/数字/下划线' }
    }
    if (keys.has(d2.key)) {
      return { valid: false, error: `维度 key 重复：${d2.key}` }
    }
    keys.add(d2.key)
    if (typeof d2.label !== 'string' || !d2.label.trim()) {
      return { valid: false, error: `维度 ${d2.key} 必须有 label` }
    }
    if (d2.label.length > 60) {
      return { valid: false, error: `维度 ${d2.key} label 过长（最多 60 字符）` }
    }
    if (typeof d2.description !== 'string' || d2.description.length > 1000) {
      return { valid: false, error: `维度 ${d2.key} 描述必须是字符串且不超过 1000 字符` }
    }
    const w = d2.weight
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0.5 || w > 9) {
      return { valid: false, error: `维度 ${d2.key} 权重必须为 0.5-9 之间的数字` }
    }
    // Weights snap to 0.5 increments, consistent with score-validation
    if (Math.abs(w - Math.round(w * 2) / 2) > 1e-6) {
      return { valid: false, error: `维度 ${d2.key} 权重必须以 0.5 为步长（如 1、1.5、2）` }
    }
    totalWeight += w
    if (!Array.isArray(d2.scoreRange) || d2.scoreRange.length !== 2) {
      return { valid: false, error: `维度 ${d2.key} scoreRange 必须是 [min, max]` }
    }
    const [lo, hi] = d2.scoreRange as unknown[]
    if (typeof lo !== 'number' || typeof hi !== 'number' || !Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
      return { valid: false, error: `维度 ${d2.key} scoreRange 必须是有效数字区间 [min, max]` }
    }
    if (d2.scoreGuide !== undefined && d2.scoreGuide !== null && (typeof d2.scoreGuide !== 'object' || Array.isArray(d2.scoreGuide))) {
      return { valid: false, error: `维度 ${d2.key} scoreGuide 必须是对象` }
    }
  }
  if (Math.abs(totalWeight - 10) > 0.01) {
    return { valid: false, error: `所有维度权重之和必须等于 10，当前为 ${+totalWeight.toFixed(2)}` }
  }
  return { valid: true }
}

/** 序列化 rubric 为 JSON 字符串（用于存入 dimensionsJson） */
export function serializeDimensions(dimensions: RubricDimension[]): string {
  return JSON.stringify(dimensions)
}

/** 反序列化 dimensionsJson 为维度数组 */
export function parseDimensions(json: string | null | undefined): RubricDimension[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed as RubricDimension[]
    return []
  } catch {
    return []
  }
}

/** 根据 rubric 生成评分指导 prompt（供 AI 报告生成使用） */
export function buildRubricGuidancePrompt(rubric: RubricData): string {
  const lines: string[] = []

  lines.push(`【评分规则说明】`)
  lines.push(`本次评测使用「${rubric.templateType === 'CODING' ? '代码开发' : rubric.templateType === 'AGENT' ? 'Agent 智能体' : '自定义'}」评分模板。`)
  lines.push(rubric.overallFormula)
  lines.push('')
  lines.push('核心评分维度：')

  for (const dim of rubric.dimensions) {
    lines.push(`- ${dim.label}（${dim.weight}分，范围 ${dim.scoreRange[0]}-${dim.scoreRange[1]}）：${dim.description}`)
    if (dim.scoreGuide) {
      const entries = Object.entries(dim.scoreGuide).sort((a, b) => Number(b[0]) - Number(a[0]))
      for (const [score, desc] of entries) {
        lines.push(`  - ${score}分：${desc}`)
      }
    }
  }

  if (rubric.templateType === 'CODING') {
    lines.push('')
    lines.push('常见扣分点（看到就扣）：')
    lines.push('- 安全风险：命令/SQL 注入、任意文件读写、泄露密钥、绕过鉴权等')
    lines.push('- 大范围无关改动：不必要的格式化整库、重构过度导致 review 困难')
    lines.push('- 缺关键保护：吞异常不处理、无超时/重试策略、无输入校验、竞态明显')
  }

  return lines.join('\n')
}
