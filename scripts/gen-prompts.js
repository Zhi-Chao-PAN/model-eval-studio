const fs = require('fs');
const path = require('path');

const BASE = 'E:/projects/model-test-assistant';

function write(filePath, content) {
  const full = path.join(BASE, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  console.log('wrote:', filePath);
}

// ============ lib/ai-prompts.ts ============
write('src/lib/ai-prompts.ts', `
// AI prompt 模板集合

export function buildSystemPrompt(background: string): string {
  return \`你是一名专业的大模型能力评测分析师。你将帮助用户对多个大模型在同一任务下的表现进行深度对比评估。

用户背景：
\${background || '用户未提供详细背景'}

请始终以专业、客观、细致的态度进行分析。
输出语言：使用中文。
\`.trim()
}

// 步骤2：生成测试思路
export function buildTestIdeaPrompt(task: {
  title: string
  category?: string
  requirementType?: string
  requirementName?: string
  description?: string
  backgroundUsed?: string
  attachmentsText?: string
}): string {
  return \`请基于以下任务信息，给出一份详细的测试思路和测试角度建议。

任务名称：\${task.title}
场景分类：\${task.category || '未指定'}
需求类别：\${task.requirementType || '未指定'}
需求名称：\${task.requirementName || '未指定'}
任务说明：
\${task.description || '无'}

\${task.attachmentsText ? \`任务附件（已解析文本）：\\n\${task.attachmentsText}\\n\` : ''}
请从以下维度展开你的测试思路：
1. 核心考察点：这个任务主要考验模型的什么能力？
2. 评估维度建议：应该从哪些角度来评估各模型的表现？
3. 注意事项：测试过程中需要特别关注什么？
4. 打分参考：各维度的评分标准建议

请结构化输出，条理清晰，专业细致。\`.trim()
}

// 步骤3：解析执行过程截图
export function buildScreenshotAnalysisPrompt(): string {
  return \`请仔细分析这几张截图，提取以下信息：

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

只输出 JSON，不要多余解释。\`.trim()
}

// 步骤3：解析数据看板截图
export function buildDashboardAnalysisPrompt(): string {
  return \`请仔细分析这张数据看板截图，提取每个模型的所有硬指标数据。

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
- 只输出 JSON，不要多余解释\`.trim()
}

// 步骤4：产物深度分析
export function buildArtifactAnalysisPrompt(task: any, models: any[]): string {
  const modelDescriptions = models.map((m, i) => {
    const artifacts = m.artifacts || []
    const artifactText = artifacts
      .map((a: any) => \`文件：\${a.name}\\n内容：\\n\${a.parsedText || a.textContent || '[二进制文件，无法直接展示文本]'}\`)
      .join('\\n\\n')
    return \`模型 \${i + 1}：\${m.modelCode}
硬指标：\${m.hardMetricsJson ? m.hardMetricsJson : '未知'}
过程摘要：\${m.processText || '未提供'}
产物内容：
\${artifactText || '未上传产物'}
\`
  }).join('\\n---\\n\\n')

  return \`请基于以下信息，对这些模型的表现进行深度对比分析。

任务信息：
- 任务名称：\${task.title}
- 需求类别：\${task.requirementType || '未指定'}
- 任务说明：\${task.description || '无'}
- 用户背景：\${task.backgroundUsed || '未提供'}

---

各模型情况：
\${modelDescriptions}

---

请从以下维度进行综合分析：
1. 正确性：各模型的产物是否正确、是否符合任务要求
2. 完整性：是否完整覆盖了任务的所有要求
3. 效率：从工具调用、耗时、轮次等角度评估效率
4. 质量：产物的质量、专业度、可读性、工程性等
5. 安全性：有没有明显的安全问题
6. 创新性：有没有出彩的地方或独特的思路

每个模型分别点评，最后给出整体对比和排名建议。

请结构化输出，条理清晰，专业细致，多引用具体证据。\`.trim()
}

// 步骤5：生成最终报告（单个模型）
export function buildReportPrompt(opts: {
  task: any
  modelCode: string
  hardMetrics: any
  processText: string
  artifactsText: string
  background: string
  analysisContext?: string
}): string {
  return \`请你以用户（测试人员）的第一人称口吻，为模型「\${opts.modelCode}」撰写一份产物反馈报告。

这份报告将被复制粘贴到测试平台的"产物反馈"表单中。

---
任务信息：
- 任务名称：\${opts.task.title}
- 需求类别：\${opts.task.requirementType || '未指定'}
- 任务说明：\${opts.task.description || '无'}

用户背景/视角：
\${opts.background || '未提供'}

该模型的硬指标数据（从数据看板解析）：
\${opts.hardMetrics ? JSON.stringify(opts.hardMetrics, null, 2) : '未提供'}

该模型的执行过程摘要：
\${opts.processText || '未提供'}

该模型的产物内容：
\${opts.artifactsText || '未提供'}

\${opts.analysisContext ? \`之前的分析结论供参考：\\n\${opts.analysisContext}\\n\` : ''}
---

请严格按照以下格式输出报告，纯文本，不要 Markdown 格式，不要代码块：

====================================
模型代号：\${opts.modelCode}
====================================

【产物效果反馈】
（写对产物是否符合预期，以及对出现的问题进行反馈。以用户第一人称，详细专业。）


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
- 全部用第一人称"我"来写
- 只输出报告文本，不要额外解释，不要放在代码块里\`.trim()
}

// 报告调整 prompt
export function buildReportAdjustPrompt(opts: {
  currentReport: string
  userInstruction: string
  modelCode: string
  background: string
}): string {
  return \`以下是当前为模型「\${opts.modelCode}」生成的报告：

\${opts.currentReport}

用户提出了修改要求：
\${opts.userInstruction}

用户背景/视角：
\${opts.background || '未提供'}

请根据用户的要求，对报告进行修改。
保留原来的格式（4 个模块、评分格式、纯文本），只修改需要调整的部分。
如果用户指出了某个模块的问题，只修改对应模块的内容，其他模块保持原样。
继续保持第一人称口吻。

只输出修改后的完整报告文本。\`.trim()
}
`.trim());

console.log('all done');
