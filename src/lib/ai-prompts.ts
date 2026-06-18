// AI prompt 模板集合
// 概念约定：
//   userBackground       —— 用户的长期身份描述（来自 /settings 里的"个人背景"）
//   taskSourceBackground —— 这次任务的题目来源/背景说明（来自任务表单里的"题目来源"，存在 backgroundUsed 字段）
//   taskPrompt           —— 用户提交给待测模型的题目原文（存在 description 字段）

export function buildSystemPrompt(userBackground: string): string {
  return `你是一名专业的大模型能力评测分析师。你将协助用户对多个大模型在同一任务下的表现进行深度对比评估。

【关于用户】
${userBackground || '（用户尚未提供个人背景信息）'}

请始终结合用户的身份与视角进行分析，输出语言：中文。
保持专业、客观、细致；引用具体证据，避免空话和模糊建议。
`.trim()
}

// 步骤 2：生成测试思路
export function buildTestIdeaPrompt(task: {
  title?: string
  description?: string       // 任务 prompt（用户给待测模型的题目原文）
  backgroundUsed?: string    // 题目来源 / 背景说明
  attachmentsText?: string
}): string {
  return `请基于以下任务信息，给出一份详细的测试思路与评估角度建议。

【任务名称】
${task.title || '（未命名）'}

【任务 prompt（用户提交给待测模型的题目原文）】
${task.description || '（未填写）'}

【题目来源 / 背景说明（这道题为什么重要、用户希望从中得到什么）】
${task.backgroundUsed || '（未填写）'}

${task.attachmentsText ? `【任务附件（已解析文本）】\n${task.attachmentsText}\n` : ''}
请围绕以下维度展开你的分析：
1. 核心考察点：这道题主要在考验模型的哪些能力？请结合「题目来源/背景说明」中体现的真实诉求来推断。
2. 评估维度建议：基于用户场景和真实价值，应该从哪些角度来评估各模型的表现？
3. 注意事项：测试过程中需要特别关注什么、容易踩什么坑？
4. 打分参考：每个维度的评分参考标准（1-10 分）。

请结构化输出，条理清晰，专业细致；要让用户读完后有清楚的"接下来该看什么"的方向。`.trim()
}

// 步骤 3：解析执行过程截图
export function buildScreenshotAnalysisPrompt(): string {
  return `请仔细分析这几张截图，提取以下信息：

1. 有多少个待测模型？分别叫什么名字（模型代号）？
2. 每个模型的对话/执行过程内容是什么？逐轮梳理
3. 每个模型用了哪些工具？工具调用次数大概多少？
4. 过程中有没有出现错误、重试、或者明显的问题？

请以 JSON 格式输出，结构如下：
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
}

只输出 JSON，不要多余解释。`.trim()
}

// 步骤 3：解析数据看板截图
export function buildDashboardAnalysisPrompt(): string {
  return `请仔细分析这张数据看板截图，提取每个模型的所有硬指标数据。

截图中是一个多列的数据表格，每一行是一个模型，每一列是一项指标。
请识别所有列名和对应的值，不要遗漏任何一列。

请以 JSON 格式输出，结构如下：
{
  "columns": ["列名1", "列名2"],
  "models": [
    {
      "modelCode": "模型名称/代号",
      "metrics": {
        "列名1": "值1",
        "列名2": "值2"
      }
    }
  ]
}

注意：
- 列名要和截图中完全一致，不要自行简化或翻译
- 数值要准确，数字保留原始格式
- 只输出 JSON，不要多余解释`.trim()
}

// 步骤 4：产物深度分析
export function buildArtifactAnalysisPrompt(task: any, models: any[]): string {
  const modelDescriptions = models.map((m, i) => {
    const artifacts = m.artifacts || []
    const artifactText = artifacts
      .map((a: any) => `文件：${a.name}\n内容：\n${a.parsedText || a.textContent || '[二进制文件，无法直接展示文本]'}`)
      .join('\n\n')
    return `模型 ${i + 1}：${m.modelCode}
硬指标：${m.hardMetricsJson ? m.hardMetricsJson : '未提供'}
执行过程摘要：${m.processText || '未提供'}
产物内容：
${artifactText || '未上传产物'}
`
  }).join('\n---\n\n')

  return `请基于以下信息，对这些模型的表现进行深度对比分析。

【任务名称】
${task.title || '（未命名）'}

【任务 prompt（用户提交给待测模型的题目原文）】
${task.description || '（未填写）'}

【题目来源 / 背景说明】
${task.backgroundUsed || '（未填写）'}

---

【各模型情况】
${modelDescriptions}

---

请从以下维度进行综合分析：
1. 正确性：各模型的产物是否正确、是否符合任务要求
2. 完整性：是否完整覆盖了「任务 prompt」中的所有诉求
3. 效率：从工具调用、耗时、轮次等角度评估
4. 质量：产物的质量、专业度、可读性、工程性
5. 安全性：有没有明显的安全或合规问题
6. 创新性：有没有出彩的地方或独特的思路
7. 与「题目来源/背景说明」中真实诉求的契合度（这是评估能否解决用户实际问题的关键）

每个模型分别点评，最后给出整体对比和排名建议。

请结构化输出，多引用具体证据；不要使用模糊用词。`.trim()
}

// 步骤 5：生成最终报告（单个模型）
export function buildReportPrompt(opts: {
  task: any
  modelCode: string
  hardMetrics: any
  processText: string
  artifactsText: string
  userBackground: string
  analysisContext?: string
}): string {
  return `请你以用户（测试人员）的第一人称口吻，为模型「${opts.modelCode}」撰写一份产物反馈报告。

这份报告将被复制粘贴到测试平台的"产物反馈"表单中，因此口吻、详略、专业度都要像真实测试人员写出来的。

---
【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt（用户提交给待测模型的题目原文）】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}

【关于用户（你应当代入的角色）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【该模型的硬指标数据（从数据看板解析）】
${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

【该模型的执行过程摘要】
${opts.processText || '未提供'}

【该模型的产物内容】
${opts.artifactsText || '未提供'}

${opts.analysisContext ? `【之前的整体分析结论，供参考】\n${opts.analysisContext}\n` : ''}
---

请严格按照以下格式输出报告，纯文本，不要 Markdown 格式，不要代码块：

====================================
模型代号：${opts.modelCode}
====================================

【产物效果反馈】
（描述产物是否符合预期，以及出现的具体问题。以用户第一人称，详细专业，引用具体证据。）


【模型的综合表现怎么样】
评分：x.x / 10
评论：
（结合产物、执行轨迹、交付效率等各方面因素给出综合评论。务必详细专业，以用户第一人称。）


【模型交付效率是否符合预期？】
评分：x.x / 10
评论：
（评价模型的交付效率，重点考虑速度、轮次、工具调用次数等效率因素。以用户第一人称。）


【模型的产物质量怎么样】
评分：x.x / 10
评论：
（评价模型产物的质量，包含正确性、完整性、可读性、专业度等。以用户第一人称。）

注意事项：
- 三个评分都是 1-10 分，支持 0.5 步长
- 评论要详细、有依据，引用具体数据和例子
- 全部用第一人称「我」来写
- 充分结合「题目来源 / 背景说明」中表达的真实诉求来判断模型表现是否到位
- 只输出报告文本，不要额外解释，不要放在代码块里`.trim()
}

// 报告调整 prompt
export function buildReportAdjustPrompt(opts: {
  currentReport: string
  userInstruction: string
  modelCode: string
  userBackground: string
}): string {
  return `以下是当前为模型「${opts.modelCode}」生成的报告：

${opts.currentReport}

用户提出了修改要求：
${opts.userInstruction}

【关于用户（保持代入的视角）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

请根据用户的要求，对报告进行修改。
- 保留原来的格式（4 个模块、评分格式、纯文本）
- 用户只指出了某个模块的问题，就只修改对应模块；其他模块保持原样
- 继续保持第一人称口吻
- 只输出修改后的完整报告文本，不要额外解释
`.trim()
}