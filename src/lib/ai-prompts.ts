export function buildSystemPrompt(userBackground: string): string {
  return `你是一名专业的大模型能力评测分析师。你将协助用户对多个大模型在同一任务下的表现进行深度对比评估。

【关于用户】
${userBackground || '（用户尚未提供个人背景信息）'}

请始终结合用户的身份与视角进行分析，输出语言为中文。保持专业、客观、细致；引用具体证据，避免空话和模糊建议。`.trim()
}

// ========== 任务设计阶段：AI 辅助出题 ==========

const CODING_DESIGN_GUIDELINES = `【Coding 任务出题规范】
你设计的 Coding 任务必须符合以下要求，否则无法通过平台审核：
1. 必须是真实的、有经济价值的开发任务，不能是为评测临时编造的题目
2. 不能是一句话 Prompt、简单静态前端页面、本科课程作业（如酒店管理系统、贪吃蛇）
3. 要有一定难度，Prompt 必须包含开发相关指令，不能只是写方案
4. 必须基于一个已有代码仓库进行修改/扩展（不是从零开始）
5. 推荐从近期真实开发工作中筛选：修 Bug、新功能、重构、工具链、测试补齐等

一个好的 Coding Prompt 应当：
- 明确说明当前项目背景和代码仓库状态
- 清晰列出需求目标和验收标准
- 包含必要的上下文信息（技术栈、约束条件）
- 有足够的复杂度，需要模型多轮思考和修改才能完成`

const AGENT_DESIGN_GUIDELINES = `【Agent 任务出题规范】
你设计的 Agent 任务必须符合以下要求：
1. 必须基于真实的工作、生活需求设计，贴近真实使用场景
2. 严禁构造无实际业务价值、纯为测试模型能力的题目
3. 优先选用高频使用场景，有一定复杂度（多步骤、需多次工具调用、需推理）
4. 单轮或多轮均可，但要能体现模型的工具调用、规划和指令遵循能力

一个好的 Agent Prompt 应当：
- 提供完整的上下文信息
- 明确的目标和约束
- 需要模型进行规划、工具调用、推理判断
- 有可验证的交付结果`

export type TaskType = 'CODING' | 'AGENT'

export function buildDesignPromptPrompt(opts: {
  taskType: TaskType
  userIdea: string
  userBackground: string
  taskTitle?: string
}): string {
  const guidelines = opts.taskType === 'CODING' ? CODING_DESIGN_GUIDELINES : AGENT_DESIGN_GUIDELINES
  const typeLabel = opts.taskType === 'CODING' ? 'Coding 代码开发' : 'Agent 智能体'

  return `你是专业的大模型评测出题专家。请根据用户的粗糙想法，帮他设计一道高质量的 ${typeLabel} 评测题。

${guidelines}

【关于用户】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

${opts.taskTitle ? `【任务名称】\n${opts.taskTitle}\n` : ''}
【用户的想法/关键词】
${opts.userIdea}

请严格使用下面两个固定标记输出，不要添加总标题，也不要改写标记：

<<<TASK_PROMPT>>>
这是用户会直接复制给待测模型的完整指令。要写得清晰、完整、有真实感，就像真实工作中提出的需求一样。

<<<BACKGROUND>>>
这段信息不会包含在给模型的 Prompt 中，而是用于评测人员理解这道题的来龙去脉。请编造一个真实可信的背景故事：
- 任务来源（公司项目/个人项目/外包需求等）
- 为什么有这个需求
- 这个任务的真实价值是什么
- 如果之前用过其他模型做过类似任务，可以补充上次的结果和遇到的问题

注意：
- 输出用中文
- 两部分内容用清晰的分隔线分开
- 任务 Prompt 要有足够的细节和复杂度，不能太简单
- 整体要像真实的工作需求，而不是一道"考试题"
- **背景说明必须用第一人称"我"来写**，模拟评测者本人的真实经历和诉求，语气自然`.trim()
}

export function buildDesignPromptAdjustPrompt(opts: {
  taskType: TaskType
  currentPrompt: string
  currentBackground: string
  userInstruction: string
  userBackground: string
}): string {
  return `以下是当前为 ${opts.taskType === 'CODING' ? 'Coding' : 'Agent'} 任务设计的题目：

--- 任务 Prompt ---
${opts.currentPrompt}

--- 题目来源 / 背景说明 ---
${opts.currentBackground}

用户提出了修改要求：
${opts.userInstruction}

【关于用户】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

请根据用户要求修改题目。严格使用下面两个固定标记输出，不要添加总标题，也不要改写标记：
<<<TASK_PROMPT>>>
修改后的任务正文
<<<BACKGROUND>>>
修改后的题目来源/背景说明
用中文输出。背景说明继续保持第一人称"我"的叙述视角。`.trim()
}

// ========== 任务设计阶段：AI 生成起始代码仓库 ==========

export function buildStarterCodePrompt(opts: {
  taskType: TaskType
  taskPrompt: string
  taskBackground: string
  userBackground: string
  complexity?: 'low' | 'medium' | 'high'
}): string {
  const typeLabel = opts.taskType === 'CODING' ? 'Coding 代码开发' : 'Agent 智能体'
  const complexityLabel = opts.complexity === 'low' ? '简单' : opts.complexity === 'high' ? '复杂' : '中等'

  return `你是专业的前端/全栈开发工程师。请为以下 ${typeLabel} 评测任务设计一个起始代码仓库。

【任务背景】
${opts.taskBackground}

【任务 Prompt（待测模型需要完成的需求）】
${opts.taskPrompt}

【关于用户】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【复杂度要求】
${complexityLabel}复杂度的起始项目。注意：起始代码是"任务开始前的状态"，待测模型需要基于这个起始代码去完成任务。
${opts.taskType === 'CODING' ? `- 起始代码应该是一个已有一定基础的项目，不是空项目
- 代码中应该包含一些已有功能、一些已知问题或待完善的部分
- 整体应该像真实开发中遇到的中间状态，有合理的不完整之处` : `- 起始代码可以是一个项目骨架或配置文件
- 为 Agent 任务提供必要的基础环境和配置`}

请输出一个 JSON 对象，包含项目的文件列表。格式如下：
{
  "projectName": "项目名称",
  "files": [
    {
      "path": "src/index.ts",
      "content": "文件内容..."
    }
  ],
  "readme": "项目说明，告诉用户这是什么项目、如何运行、待测模型需要做什么"
}

要求：
- 只输出 JSON，不要额外解释，不要 Markdown 代码块
- 文件数量控制在 5-15 个之间（${complexityLabel}复杂度）
- 代码要真实可运行，结构合理
- 用中文写 README 说明
- 选择合适的技术栈（优先考虑常见、易运行的组合，如 Next.js + TypeScript、Node.js + Express 等）`.trim()
}

export function buildTestIdeaPrompt(task: {
  title?: string
  description?: string
  backgroundUsed?: string
  attachmentsText?: string
}): string {
  return `请基于以下任务信息，给出一份详细的测试思路与评估角度建议。

【任务名称】
${task.title || '（未命名）'}

【任务 prompt（用户提交给待测模型的题目原文）】
${task.description || '（未填写）'}

【题目来源 / 背景说明】
${task.backgroundUsed || '（未填写）'}

${task.attachmentsText ? `【任务附件（已解析文本）】\n${task.attachmentsText}\n` : ''}

请围绕以下维度展开：
1. 核心考察点：这道题主要在考验模型的哪些能力？
2. 评估维度建议：应该从哪些角度评估各模型表现？
3. 注意事项：测试过程中需要特别关注什么，容易踩什么坑？
4. 打分参考：每个维度的 1-10 分参考标准。

请结构化输出，条理清晰，专业细致。`.trim()
}

export function buildScreenshotAnalysisPrompt(): string {
  return `请仔细分析这些执行过程截图，提取以下信息：

1. 有多少个待测模型？分别叫什么名字或模型代号？
2. 每个模型的对话/执行过程内容是什么？请逐轮梳理。
3. 每个模型用了哪些工具？工具调用次数大概多少？
4. 过程中有没有出现错误、重试、明显绕路或关键问题？

请只输出 JSON，结构如下：
{
  "models": [
    {
      "modelCode": "模型代号",
      "displayName": "显示名",
      "processSummary": "执行过程摘要",
      "processDetail": "详细的对话/执行过程文本",
      "toolCalls": 0,
      "issues": []
    }
  ]
}`.trim()
}

export function buildDashboardAnalysisPrompt(): string {
  return `请仔细分析这张数据看板截图，提取每个模型的所有硬指标数据。

截图中是一个多列数据表格，每一行是一个模型，每一列是一项指标。请识别所有列名和对应的值，不要遗漏任何一列。

请只输出 JSON，结构如下：
{
  "columns": ["列名1", "列名2"],
  "models": [
    {
      "modelCode": "模型名称/代号",
      "metrics": {
        "列名1": "值",
        "列名2": "值"
      }
    }
  ]
}

注意：
- 列名要和截图中完全一致，不要自行简化或翻译。
- 数值要准确，数字保留原始格式。
- 只输出 JSON，不要额外解释。`.trim()
}

export function buildArtifactAnalysisPrompt(task: any, models: any[]): string {
  const modelDescriptions = models.map((model, index) => {
    const artifacts = model.artifacts || []
    const artifactText = artifacts
      .map((artifact: any) => `文件：${artifact.name}\n内容：\n${artifact.parsedText || artifact.textContent || '[二进制文件，无法直接展示文本]'}`)
      .join('\n\n')

    return `模型 ${index + 1}：${model.modelCode}
硬指标：${model.hardMetricsJson || '未提供'}
执行过程摘要：${model.processText || '未提供'}
产物内容：
${artifactText || '未上传产物'}`
  }).join('\n\n---\n\n')

  return `请基于以下信息，对这些模型的表现进行深度对比分析。

【任务名称】
${task.title || '（未命名）'}

【任务 prompt】
${task.description || '（未填写）'}

【题目来源 / 背景说明】
${task.backgroundUsed || '（未填写）'}

【各模型情况】
${modelDescriptions}

请从正确性、完整性、效率、质量、安全性、创新性，以及与真实需求的契合度进行综合分析。多引用具体证据，不要使用模糊用语。`.trim()
}

export function buildReportPrompt(opts: {
  task: any
  modelCode: string
  hardMetrics: any
  processText: string
  artifactsText: string
  userBackground: string
  verificationSummary?: string
  hasTrajectory?: boolean
  analysisContext?: string
  taskType?: TaskType | string
  rubricGuidance?: string
}): string {
  const isCoding = opts.taskType === 'CODING'
  const isAgent = opts.taskType === 'AGENT'

  // 如果传入了自定义 rubric 指导，优先使用；否则回退到基于类型的硬编码指导
  const typeSpecificGuidance = opts.rubricGuidance || (isCoding
    ? `
【任务类型说明】
这是一个 Coding 代码开发任务。请按照 Coding 评测标准进行评估：

核心评分维度（总分 10 分 = 需求完成度 0-5 分 + 代码质量 0-3 分 + 轨迹质量 0-2 分）：

1. 需求完成度（0-5）：决定「能不能用」
   - 5：核心需求全部满足；主流程顺畅；边界/异常场景也基本覆盖；交付可直接用
   - 4：核心需求满足；有少量非关键缺口或小 Bug，但不影响主流程
   - 3：主流程勉强跑通；缺关键细节/验收点；需要手动补救才能用
   - 2：只完成一部分；核心验收点没过或经常出错
   - 1：接近跑偏；和需求匹配度很低
   - 0：未交付有效结果/不可运行/完全不相关

2. 代码质量（0-3）：决定「敢不敢合、好不好维护」
   - 3：结构清晰；改动克制；命名/边界处理合理；无明显安全/性能坑；有必要的测试或自检手段
   - 2：整体可维护；有些瑕疵（重复、轻微坏味道、类型/异常处理一般），但风险可控
   - 1：能用但明显脆弱（硬编码、耦合重、缺关键校验、潜在回归点多）
   - 0：明显不安全/高风险/不可维护

常见扣分点（看到就扣）：
- 安全风险：命令/SQL 注入、任意文件读写、泄露密钥、绕过鉴权等
- 大范围无关改动：不必要的格式化整库、重构过度导致 review 困难
- 缺关键保护：吞异常不处理、无超时/重试策略、无输入校验、竞态明显

3. 轨迹质量（0-2）：决定「过程是否可信、可复用、可协作」
   - 2：步骤可复现；会先澄清关键不确定点；解释取舍；工具/命令使用克制且安全；有验证闭环
   - 1：过程基本顺；但有跳步、解释不足、偶尔走弯路或验证不充分
   - 0：过程混乱或不可信（编造结果、未验证却宣称完成、反复无效尝试、忽略关键风险/约束）

总分封顶规则（命中任一情况命中，则总分必须封顶）：
- 核心需求未完成：总分不超过 6
- 结果不可运行/无法验证，且未提供清晰复现与修复指引：总分不超过 4
- 明显跑题：总分不超过 2

快速打分流程：
1. 先选档位（9-10 惊喜 / 7-8 满意 / 5-6 勉强可用 / 3-4 明显不行 / 0-2 基本失败）
2. 看封顶
3. 三维度落点
4. 综合为每个维度给出评分理由`
    : isAgent
    ? `
【任务类型说明】
这是一个 Agent 智能体任务。请按照 Agent 评测标准进行评估：

核心关注维度：
1. 指令理解与遵循度：Agent 是否准确理解并完成了用户的意图？是否遵循了所有指令中的约束和要求？
2. 规划能力：是否有合理的任务拆解和执行规划？步骤是否清晰、有条理？
3. 工具调用：工具使用是否正确、高效？有没有滥用或无效调用？
4. 推理与判断：推理过程是否合理？有没有陷入死循环？
5. 幻觉检测：是否出现严重的幻觉（胡编乱造、虚构事实、编造结果）？
6. 交付结果：最终交付物是否符合要求？质量如何？

评分重点关注：
- Agent 是否准确理解并完成了你的意图？
- 是否陷入死循环？
- 是否出现严重的幻觉（胡编乱造）？
- 工具调用是否正确、高效？
- 规划是否合理？`
    : '')

  const typeSpecificScoring = opts.rubricGuidance
    ? `
【产物质量评分参考】
产物质量评分请综合考虑各评分维度中与产物本身相关的维度。评分允许 1-10，支持 .5 分。
- 重点看交付物质量、需求满足度、正确性、完整性
- 请在评论中说明你的判断依据

【交付效率评分参考】
交付效率评分请结合轨迹过程、规划效率、工具使用效率来评。评分允许 1-10，支持 .5 分。
- 步骤是否清晰高效、工具有效利用、无明显绕路或无效尝试
- 是否有验证闭环

【综合评分参考】
综合评分按评分规则中的总分公式计算。必须是 1-10 的整数。
- 结合所有评分维度加权求和
- 注意评分规则中的封顶/约束条件`
    : (isCoding
    ? `
【产物质量评分参考】
产物质量评分请综合考虑需求完成度和代码质量。评分允许 1-10，支持 .5 分。
- 参考：需求完成度（0-5）+ 代码质量（0-3）= 0-8 分，映射到 1-10 分
- 例如：需求 4 + 代码 3 = 7 → 产物质量约 8.5/10
- 请在评论中说明需求完成度和代码质量的具体判断

【交付效率评分参考】
交付效率评分请结合轨迹质量来评。评分允许 1-10，支持 .5 分。
- 轨迹质量高（2分）：交付效率高，步骤清晰，验证闭环
- 轨迹质量中（1分）：交付效率一般，有些绕路或验证不足
- 轨迹质量低（0分）：交付效率低，过程混乱

【综合评分参考】
综合评分请按总分公式计算：需求完成度 + 代码质量 + 轨迹质量 = 总分（0-10）
综合评分必须是 1-10 的整数。
注意封顶规则：核心需求未完成不超过6，不可运行不超过4，明显跑题不超过2。`
    : isAgent
    ? `
【产物质量评分参考】
产物质量评分请综合考虑交付结果质量和指令遵循度。评分允许 1-10，支持 .5 分。
- 重点看最终交付物是否符合要求、质量如何
- 指令是否被准确理解和遵循

【交付效率评分参考】
交付效率评分请结合规划能力和工具调用效率来评。评分允许 1-10，支持 .5 分。
- 规划是否合理、高效
- 工具调用是否正确、有无浪费
- 是否陷入死循环或反复无效尝试

【综合评分参考】
综合评分请整体评估 Agent 的整体表现。必须是 1-10 的整数。
- 结合指令理解、规划能力、工具调用、推理判断、幻觉检测、交付结果。`
    : '')

  return `请你代入测试者本人，以第一人称口吻为模型「${opts.modelCode}」撰写一份可直接提交到测试平台表单的评估报告。

这份报告会被复制粘贴到平台表单中，必须严格对应需要提交的模块。正文要像“我”在完成核验后亲自填写的反馈，不要写成给用户看的分析稿，不要出现“用户认为”“测试者认为”“建议用户”这类第三人称旁白。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}
${typeSpecificGuidance}

【测试者背景（你应当代入的视角）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【该模型的硬指标数据】
${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

【该模型的执行轨迹】
${opts.processText || '未提供轨迹截图'}

【该模型的产物内容】
${opts.artifactsText || '未提供'}

【产物效果截图解读】
${opts.verificationSummary || '未提供产物效果截图。产物效果反馈暂不能生成，其余模块可基于产物内容、任务要求、硬指标和轨迹进行评估。'}

${opts.analysisContext ? `【之前的整体分析结论，供参考】\n${opts.analysisContext}\n` : ''}
${typeSpecificScoring}

请严格按以下格式输出，纯文本，不要 Markdown，不要代码块：

====================================
评估对象：${opts.modelCode}
====================================

【产物效果反馈】
（这一项必须基于“产物效果截图解读”来写，以第一人称“我”描述本地验收产物后的真实反馈。只陈述截图确实展示的界面、文本、数据或运行结果；不得根据文件名、代码内容或想象补全截图之外的运行效果。如果未提供产物效果截图，本节只能写“未上传产物效果截图，暂无法填写产物效果反馈。”不要用产物文本替代截图结论。）

【模型交付效率是否符合预期？】
评分：x.x / 10
评论：（交付效率评分允许 1-10，支持 .5，例如 6.5、7.5。可结合任务 prompt、硬指标、执行轨迹、面板数据和产物解析结果独立判断，不要求必须有产物效果截图。${isCoding ? '重点结合轨迹质量：步骤可复现性、验证闭环、工具/命令使用效率。' : isAgent ? '重点结合规划能力、工具调用效率、是否陷入死循环或反复无效尝试。' : '重点结合耗时、轮次、工具调用、重试、绕路、是否一次交付到位。'}）

【模型的产物质量怎么样】
评分：x.x / 10
评论：（产物质量评分允许 1-10，支持 .5，例如 6.5、7.5。可基于模型自行解压/解析出的产物内容、任务 prompt、硬指标和轨迹判断，不要求必须有产物效果截图。${isCoding ? '重点结合需求完成度和代码质量：正确性、完整性、结构清晰度、可维护性、有无安全风险。' : isAgent ? '重点结合交付结果质量和指令遵循度：是否准确理解意图、交付物是否符合要求、质量如何。' : '重点结合正确性、完整性、可用性、专业性、可读性、工程质量。'}）

【模型的综合表现怎么样】
评分：x / 10
评论：（综合评分必须是 1-10 的整数，不允许 .5。结合产物解析结果、任务契合度、交付效率、产物质量和可用证据给出整体评价；没有产物效果截图时，不要声称已经完成本地运行验收。${isCoding ? '注意封顶规则：核心需求未完成不超过6，不可运行不超过4，明显跑题不超过2。' : ''}）

【轨迹分析】
${opts.hasTrajectory ? `（必须基于执行轨迹截图/轨迹文本进行分析，指出亮点、问题、工具调用和关键过程证据。${isCoding ? '重点关注轨迹质量：步骤可复现性、验证闭环、失败后的定位与修复。' : isAgent ? '重点关注规划能力、工具调用、推理判断、是否陷入死循环、有无幻觉。' : ''}）` : '未提供轨迹截图。'}

注意事项：
- 产物效果反馈、交付效率、产物质量、综合评价、轨迹分析都必须输出。
- 综合评分只能是 1-10 的整数。
- 交付效率和产物质量评分可以是 1-10 内的整数或 .5 分。
- 如果没有执行轨迹，轨迹分析只能写”未提供轨迹截图。”，不要编造。
- 全部用第一人称“我”来写，正文不要把自己称为“用户”“测试者”或“测试人员”。`.trim()
}

export function buildReportAdjustPrompt(opts: {
  currentReport: string
  userInstruction: string
  modelCode: string
  userBackground: string
}): string {
  return `以下是当前为模型「${opts.modelCode}」生成的评估报告：
${opts.currentReport}

用户提出了修改要求：
${opts.userInstruction}

【测试者背景（保持代入视角）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

请根据用户要求修改报告。

硬性要求：
- 保留 5 个模块：产物效果反馈、交付效率、产物质量、综合表现、轨迹分析。
- 综合评分只能是 1-10 的整数。
- 交付效率和产物质量评分可以是 1-10 内的整数或 .5 分。
- 用户只指出某个模块的问题时，只修改对应模块，其它模块保持原意。
- 继续保持第一人称表单提交口吻，不要写成给用户看的说明稿，也不要把自己称为“用户”“测试者”或“测试人员”。
- 只输出修改后的完整报告文本，不要额外解释。`.trim()
}

export function buildSingleFileAnalysisPrompt(opts: {
  task: any
  fileName: string
  fileContent: string
  userBackground: string
  previousFiles: string
  taskType?: TaskType | string
}): string {
  const isCoding = opts.taskType === 'CODING'
  const isAgent = opts.taskType === 'AGENT'

  const typeSpecificFocus = isCoding
    ? `
【分析重点 - Coding 任务】
重点关注：
- 代码正确性：是否有 Bug、逻辑是否正确
- 代码质量：结构是否清晰、命名是否合理、有无重复代码
- 工程质量：错误处理、边界条件、类型安全、性能考虑
- 安全性：有无注入风险、敏感信息泄露等问题
- 可维护性：是否容易理解和修改`
    : isAgent
    ? `
【分析重点 - Agent 任务】
重点关注：
- 工具调用是否正确合理
- 逻辑流程是否清晰
- 是否有幻觉或编造的内容
- 指令遵循程度`
    : ''

  return `你是专业的模型产物评测分析师。请对一份模型产物文件进行要点提取和质量分析。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}

【关于你的评测视角】
${opts.userBackground || '（用户尚未提供个人背景信息）'}
${typeSpecificFocus}

${opts.previousFiles ? `【之前分析过的其他文件要点（供上下文参考，不要重复分析）】\n${opts.previousFiles.slice(0, 3000)}\n` : ''}
【当前文件】
文件名：${opts.fileName}
文件内容：
${opts.fileContent}

请提取并分析：
1. 这份文件的核心内容是什么？（2-3 句话概括）
2. 文件中体现了模型做对了什么？（具体证据）
3. 文件中发现了什么错误、遗漏或问题？（具体指出位置和内容）
4. 代码/文档的质量如何？（结构、规范、可读性）
5. 这份产物是否符合任务要求？为什么？

要求：
- 具体、客观，引用原文中的证据
- 不要空泛的赞美或批评
- 用中文，分点陈述`.trim()
}

export function buildFilesSummaryPrompt(opts: {
  task: any
  modelCode: string
  hardMetrics: any
  processText: string
  filesAnalysis: string
  userBackground: string
  verificationSummary?: string
  hasTrajectory?: boolean
  taskType?: TaskType | string
}): string {
  const isCoding = opts.taskType === 'CODING'
  const isAgent = opts.taskType === 'AGENT'

  const typeSpecific = isCoding
    ? `
【任务类型】
这是 Coding 代码开发任务。请重点从以下角度综合评估：
- 需求完成度：核心需求是否满足，主流程是否顺畅，验收点是否通过
- 代码质量：结构是否清晰、改动是否克制、有无安全/性能风险、可维护性如何
- 轨迹质量：过程是否可复现、是否有验证闭环、失败后是否能定位修复
- 总分 = 需求完成度(0-5) + 代码质量(0-3) + 轨迹质量(0-2)`
    : isAgent
    ? `
【任务类型】
这是 Agent 智能体任务。请重点从以下角度综合评估：
- 指令理解与遵循度：是否准确理解意图，是否遵循所有约束
- 规划能力：任务拆解是否合理，步骤是否清晰
- 工具调用：工具使用是否正确高效，有无滥用或无效调用
- 推理与判断：推理是否合理，有无陷入死循环
- 幻觉检测：是否编造事实、虚构结果`
    : ''

  return `你是专业的模型评测专家。以下是对单个模型所有产物文件的逐一分析结果，请你综合这些信息，形成对该模型的完整评估。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}
${typeSpecific}

【评测视角】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【模型】
${opts.modelCode}

【硬指标数据】
${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

【执行轨迹】
${opts.processText || '未提供轨迹截图'}

【产物效果截图解读】
${opts.verificationSummary || '未提供产物效果截图。产物效果反馈暂不能生成，其余模块可继续基于产物内容和任务信息评估。'}

【各产物文件的详细分析】
${opts.filesAnalysis}

请综合以上所有信息，形成对这个模型的完整评估。要求：
- 结合所有产物文件，不遗漏任何重要问题
- 区分主要问题和次要问题
- 有整体判断，不只罗列细节
- 用中文，条理清晰`.trim()
}
