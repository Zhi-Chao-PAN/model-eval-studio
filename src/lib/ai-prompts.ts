export function buildSystemPrompt(userBackground: string): string {
  return `你是一名专业的大模型能力评测分析师。你将协助用户对多个大模型在同一任务下的表现进行深度对比评估。

【关于用户】
${userBackground || '（用户尚未提供个人背景信息）'}

请始终结合用户的身份与视角进行分析，输出语言为中文。保持专业、客观、细致；引用具体证据，避免空话和模糊建议。`.trim()
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
}): string {
  return `请你以用户（测试人员）的第一人称口吻，为模型「${opts.modelCode}」撰写一份可提交到测试平台的评估报告。

这份报告会被复制粘贴到平台表单中，必须严格对应测试人员需要提交的模块。请不要写成泛泛总结，要像真实测试人员基于产物、截图和轨迹证据写出的反馈。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}

【关于用户（你应当代入的视角）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【该模型的硬指标数据】
${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

【该模型的执行轨迹】
${opts.processText || '未提供轨迹截图'}

【该模型的产物内容】
${opts.artifactsText || '未提供'}

【真实产物验证证据解读】
${opts.verificationSummary || '未提供真实产物验证截图，反馈只能基于上传产物文本和任务要求判断。'}

${opts.analysisContext ? `【之前的整体分析结论，供参考】\n${opts.analysisContext}\n` : ''}

请严格按以下格式输出，纯文本，不要 Markdown，不要代码块：

====================================
评估对象：${opts.modelCode}
====================================

【产物效果反馈】
（必须结合产物内容和“真实产物验证证据解读”来写，以第一人称“我”描述自己核验产物后的真实反馈。只陈述截图确实展示的界面、文本、数据或运行结果；不得把系统内文件预览说成工具已执行。如果没有真实截图，明确指出未提供真实产物验证截图，反馈只能基于上传产物文本和任务要求判断。反馈要具体：是否符合预期、有无错误遗漏、可用性如何。）

【模型交付效率是否符合预期？】
评分：x.x / 10
评论：（交付效率评分允许 1-10，支持 .5，例如 6.5、7.5。重点结合耗时、轮次、工具调用、重试、绕路、是否一次交付到位。）

【模型的产物质量怎么样】
评分：x.x / 10
评论：（产物质量评分允许 1-10，支持 .5，例如 6.5、7.5。重点结合正确性、完整性、可用性、专业性、可读性、工程质量。）

【模型的综合表现怎么样】
评分：x / 10
评论：（综合评分必须是 1-10 的整数，不允许 .5。结合产物效果、交付效率、产物质量、真实需求契合度给出整体评价。）

【轨迹分析】
${opts.hasTrajectory ? '（必须基于执行轨迹截图/轨迹文本进行分析，指出亮点、问题、工具调用和关键过程证据。）' : '未提供轨迹截图。'}

注意事项：
- 产物效果反馈、交付效率、产物质量、综合评价、轨迹分析都必须输出。
- 综合评分只能是 1-10 的整数。
- 交付效率和产物质量评分可以是 1-10 内的整数或 .5 分。
- 如果没有执行轨迹，轨迹分析只能写“未提供轨迹截图。”，不要编造。
- 全部用第一人称“我”来写。`.trim()
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

【关于用户（保持代入视角）】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

请根据用户要求修改报告。

硬性要求：
- 保留 5 个模块：产物效果反馈、交付效率、产物质量、综合表现、轨迹分析。
- 综合评分只能是 1-10 的整数。
- 交付效率和产物质量评分可以是 1-10 内的整数或 .5 分。
- 用户只指出某个模块的问题时，只修改对应模块，其它模块保持原意。
- 继续保持第一人称口吻。
- 只输出修改后的完整报告文本，不要额外解释。`.trim()
}

export function buildSingleFileAnalysisPrompt(opts: {
  task: any
  fileName: string
  fileContent: string
  userBackground: string
  previousFiles: string
}): string {
  return `你是专业的模型产物评测分析师。请对一份模型产物文件进行要点提取和质量分析。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}

【关于你的评测视角】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

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
}): string {
  return `你是专业的模型评测专家。以下是对单个模型所有产物文件的逐一分析结果，请你综合这些信息，形成对该模型的完整评估。

【任务名称】
${opts.task.title || '（未命名）'}

【任务 prompt】
${opts.task.description || '（未填写）'}

【题目来源 / 背景说明】
${opts.task.backgroundUsed || '（未填写）'}

【评测视角】
${opts.userBackground || '（用户尚未提供个人背景信息）'}

【模型】
${opts.modelCode}

【硬指标数据】
${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

【执行轨迹】
${opts.processText || '未提供轨迹截图'}

【真实产物验证证据解读】
${opts.verificationSummary || '未提供真实产物验证截图。'}

【各产物文件的详细分析】
${opts.filesAnalysis}

请综合以上所有信息，形成对这个模型的完整评估。要求：
- 结合所有产物文件，不遗漏任何重要问题
- 区分主要问题和次要问题
- 有整体判断，不只罗列细节
- 用中文，条理清晰`.trim()
}
