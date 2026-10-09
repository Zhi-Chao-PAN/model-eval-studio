# 证据驱动评测系统 V1 — 完成报告

> test 分支上第三轮稳定性迭代（按用户长期约束 + 本轮任务清单执行）。
> 本报告记录 V1 证据链 + 安全自动验收运行器 + 报告引用的端到端落地。
> **不提交 docs/agent-reports/，作为本地验收材料。**

---

## 1. 本轮目标完成情况

| 目标 | 状态 | 说明 |
|------|------|------|
| 自动构建证据链 | ✅ | `artifact-evidence-chain.ts` 提供 builder / 序列化 / 报告摘要 |
| 自动生成后台候选证据 | ✅ | `artifact-auto-runner.ts`（V1 纯静态） |
| UI 可查看可审计分析轨迹 | ✅ | 现有 `ArtifactAnalysisTrace` 通过新增 `evidence_chain` 阶段事件 + metadata 标签自动展示 |
| 报告生成时引用证据 | ✅ | `buildReportPrompt` 新增 `evidenceChainSummary` 字段；两个调用点都接好 |
| 严格区分正式截图 vs 后台证据 | ✅ | `isAuthenticVerificationEvidence` 仍只接受 `tester_upload`；证据链只承载 `auto_runner` / `parser` / `analysis_runtime` 来源 |
| 5 模块 + 复制 MD 干净 | ✅ | `submission-md` 路径未触碰；测试仍 100% 通过 |
| 不执行不可信代码、不接 Sandbox、不伪造截图 | ✅ | V1 全静态；只复用 `artifact-preview` 已有的辅助函数 |

---

## 2. 新增能力说明

### 2.1 证据链（ArtifactEvidence）
- 类型枚举 `EvidenceType`：`file_manifest` / `parsed_content` / `primary_artifact` / `structure_check` / `quality_signal` / `limitation` / `auto_candidate` / `error`
- 来源枚举 `EvidenceSource`：`artifact_upload` / `parser` / `auto_runner` / `analysis_runtime`
- 防御性清洗：title 不允许是 HTML 错误页；metadata 拒绝 `think` / `reasoning` / `chain_of_thought` 字段；长文本截断
- 序列化到 `TaskModel.artifactAnalysisJson.evidenceChain`（v2 schema 兼容字段）

### 2.2 安全自动验收运行器 V1
- 零网络、零执行、零 npm install
- 主产物识别：复用 `artifactEntryScore`；HTML 错误页 / node_modules / 字体 / 缓存文件降权或过滤
- 输出：`file_manifest` + `primary_artifact` + `parsed_content` + `structure_check` + `quality_signal` + `auto_candidate` + `limitation`
- 空产物 / 全无效产物：返回 `hasUsablePrimary = false` + 多条 `limitation`

### 2.3 workflow 接入
- 新增 workflow step `buildEvidence`，在 `inspect` 之后 / 视觉解读之前插入
- 完成后立即把 chain 写入 `taskModel.artifactAnalysisJson`（避开 workflow step 参数序列化限制）
- `finalize` 时重新读取并 attach 进最终 v2 JSON

### 2.4 UI 证据链展示
- 既有 `ArtifactAnalysisTrace` 基于事件流渲染，新阶段 `evidence_chain` 自动出现
- Metadata labels 新增：`itemCount` / `types` / `primaryName` / `hasUsablePrimary` / `artifactChanged` / `evidenceChanged`
- 文案避免"AI 内心思考""思维链"——只显示"后台候选证据链""主产物"等客观描述

### 2.5 报告生成接入
- `buildReportPrompt` 接收 `evidenceChainSummary`
- 报告 prompt 在"之前的整体分析结论"之后插入新段落：
  ```
  【后台候选证据摘要（来自自动验收运行器 V1 + 解析器；不是测试者本地验收截图，不能据此生成产物效果反馈）】
  ...
  ```
- 重要：摘要只允许 `auto_runner` / `parser` / `analysis_runtime` 来源；`artifact_upload` 永不进入报告上下文
- `verificationSummary`（即产物效果截图解读）继续走原路，**完全不受影响**

---

## 3. 修改文件列表

| 文件 | 状态 | 行数变化 |
|------|------|---------|
| `src/lib/artifact-evidence-chain.ts` | **新增** | +276 |
| `src/lib/artifact-evidence-chain.test.ts` | **新增** | +214 |
| `src/lib/artifact-auto-runner.ts` | **新增** | +291 |
| `src/lib/artifact-auto-runner.test.ts` | **新增** | +175 |
| `src/lib/model-artifact-analysis.ts` | 修改 | +20 / -7（v2 schema 兼容 `evidenceChain` 字段） |
| `src/lib/artifact-analysis-runtime.ts` | 修改 | +159 |
| `src/workflows/artifact-analysis.ts` | 修改 | +8 |
| `src/components/tasks/ArtifactAnalysisTrace.tsx` | 修改 | +5 / -1（metadata labels） |
| `src/lib/ai-prompts.ts` | 修改 | +9 / -3（`buildReportPrompt` 新字段） |
| `src/lib/report-generation.ts` | 修改 | +9（接入 evidence chain summary） |
| `src/app/api/tasks/[id]/generate-report/route.ts` | 修改 | +11（同上） |

**未触碰 / 故意不动**：
- `prisma/schema.prisma`（证据链走现有 JSON 字段，不需新增列）
- `src/components/tasks/VerificationEvidencePanel.tsx`（正式截图规则已合规）
- `src/lib/verification-evidence.ts`（`tester_upload` 过滤已硬约束）
- `src/app/api/tasks/[id]/export/route.ts`（提交版导出未触碰）
- `src/app/tasks/[id]/StepArtifact.tsx`（UX 已稳定，本轮不需要再改）

---

## 4. 每个文件改了什么

### `src/lib/artifact-evidence-chain.ts`（新增）
纯 TS 数据结构 + builders + 序列化 + 报告摘要。

- `EVIDENCE_TYPE_VALUES` / `EVIDENCE_SOURCE_VALUES` 枚举常量
- `ArtifactEvidence` 接口（不含 raw think 字段）
- `buildEvidence({...})` 工厂函数：清洗 title/summary/detail；防御 HTML 错误页；剥离 banned metadata keys（`think` / `reasoning` / `chain_of_thought`）；数组截断到 32 项
- `serializeEvidenceChain(items, modelId)` → `{ version, modelId, generatedAt, items }`
- `parseStoredEvidenceChain(raw)` 容错解析，损坏 JSON 返回 null
- `loadEvidenceChainFromAnalysis(analysis)` 适配 StoredModelArtifactAnalysis 形态
- `buildEvidenceChainSummaryForReport(chain, maxChars=1800)` 紧凑报告摘要，**只**抽取 `auto_runner` / `parser` / `analysis_runtime` 来源

### `src/lib/artifact-evidence-chain.test.ts`（新增）
11 个单测：枚举稳定、四种基础 evidence、超长截断、HTML 错误页替换、think metadata 拒绝、数组截断、序列化往返、损坏 JSON 兜底、报告摘要白名单（`auto_runner` / `parser` / `analysis_runtime`）、空 chain、空字符串越界。

### `src/lib/artifact-auto-runner.ts`（新增）
V1 自动验收运行器，纯函数、零依赖。

- `runSafeArtifactAutoRunner({ modelId, artifacts })`：按以下顺序产出证据
  1. 空产物 → 两条 `limitation`（无产物 + V1 边界）
  2. `file_manifest`：列名 / 类型 / 大小 / 过滤数（junk）
  3. `primary_artifact`：按 `artifactEntryScore` 排序，过滤 junk 文件名 / HTML 错误页 / 空文本
  4. `parsed_content`：仅当有解析文本时
  5. `structure_check`：hasReadme / hasManifest / hasEntry / hasReport / onlyImages / emptyCount
  6. `quality_signal`：综合工程结构 + only images + 过小文本类产物
  7. `auto_candidate`：可作为效率/质量/综合评价的候选依据
  8. `limitation`：明确写"未执行不可信代码、未接入 Sandbox、不可等同本地验收"
- 返回 `{ items, hasUsablePrimary, primaryName, primaryKind }`

### `src/lib/artifact-auto-runner.test.ts`（新增）
10 个单测：空产物、典型工程、PDF 主产物、HTML 错误页降权、字体过滤、纯图片、limitation 边界、auto_candidate 可被报告引用、source 永不 `artifact_upload`、全 HTML 错误页场景。

### `src/lib/model-artifact-analysis.ts`（修改）
- `StoredModelArtifactAnalysis` 增加可选字段 `evidenceChain?: string | null`
- `parseStoredModelArtifactAnalysis` 解析时把 `evidenceChain` 一并返回（缺失时不破坏 v2 数据）
- 其他字段 / 校验不变

### `src/lib/artifact-analysis-runtime.ts`（修改）
- 增加 `buildArtifactEvidenceChain(input)`：调 auto runner、把 chain 同步写入 `taskModel.artifactAnalysisJson`、追加 `evidence_chain` 阶段事件（带 metadata.itemCount / types / primaryName / hasUsablePrimary）
- 增加 `attachEvidenceChainToAnalysisJson(existingJson, evidenceChain)`：把 chain 合并进 v2 JSON 兼容层
- 删除多余的 `loadEvidenceChainFromAnalysis` 副本（已统一搬到 `artifact-evidence-chain.ts`）
- `finalizeArtifactAnalysis(input, filesAnalysis)` 在写 v2 JSON 时从 `taskModel.artifactAnalysisJson` 取已有 `evidenceChain` 一并 attach，避免跨 workflow step 传复杂对象
- 整体错误处理：`buildArtifactEvidenceChain` 自身失败时记 WARNING 事件并继续，让后续阶段不被打断

### `src/workflows/artifact-analysis.ts`（修改）
- 在 `captureEvidence` 之后 / `reviewEvidence` 之前新增 `buildEvidence` workflow step
- 调 `buildArtifactEvidenceChain`

### `src/components/tasks/ArtifactAnalysisTrace.tsx`（修改）
- `labels` 表新增 `itemCount` / `types` / `primaryName` / `hasUsablePrimary` / `artifactChanged` / `evidenceChanged`，让 `evidence_chain` 阶段事件的 metadata 在 UI 里显示得更可读
- 其它渲染逻辑保持不变（既有的"phase / label / detail / timestamp / metadata"展示已经合规）

### `src/lib/ai-prompts.ts`（修改）
- `buildReportPrompt` 接收 `evidenceChainSummary?: string` 字段
- prompt 中在"之前的整体分析结论"之后插入新段落；强调"不是测试者本地验收截图，不能据此生成产物效果反馈"
- 未引入"think / 思维链"文案；所有 prompt 段落保留"测试者本人第一人称"规则

### `src/lib/report-generation.ts`（修改）
- 新 import：`buildEvidenceChainSummaryForReport` / `loadEvidenceChainFromAnalysis`
- `generateReportForModel` 调 `buildReportPrompt` 时附 `evidenceChainSummary`

### `src/app/api/tasks/[id]/generate-report/route.ts`（修改）
- 新 import 同上
- `generate-report` 主流程同样附 `evidenceChainSummary`
- `adjustReport` 路径不变（用的是已生成的旧报告，不重新注入摘要，避免覆盖）

---

## 5. 数据流说明

```
[1] 用户上传产物
   └─ POST /api/tasks/:id/models/:modelId/artifacts
      └─ DB: ModelArtifact (textContent / parsedText / mimeType / size)

[2] 自动分析启动
   └─ POST /api/tasks/:id/models/:modelId/artifact-analysis
      └─ 事务：ArtifactAnalysisRun (QUEUED)
      └─ Workflow 启动（'use workflow'）
         ├─ beginArtifactAnalysis
         ├─ inspectArtifactInputs          → 'inspect' 事件
         ├─ captureArtifactEvidence         → 'capture' 事件（仅 tester_upload）
         ├─ buildArtifactEvidenceChain      ← NEW → 'evidence_chain' 事件
         │    ├─ runSafeArtifactAutoRunner
         │    └─ 写入 taskModel.artifactAnalysisJson.evidenceChain
         ├─ analyzeArtifactEvidence         → 'visual_review' 事件
         ├─ analyzeArtifactFiles            → 'content_review' 事件
         ├─ summarizeArtifactFiles          → 'synthesis' 事件
         └─ finalizeArtifactAnalysis
              ├─ 重读 taskModel.artifactAnalysisJson.evidenceChain
              └─ 写回完整 v2 JSON（含 filesAnalysis + verificationSummary + evidenceChain）

[3] UI 展示
   └─ StepArtifact → ArtifactAnalysisTrace
      ├─ 既有 events 流：phase / label / detail / timestamp / metadata
      └─ 新事件 'evidence_chain' 自动出现，metadata 标签显示 itemCount / types / primaryName

[4] 报告生成
   └─ POST /api/tasks/:id/generate-report
      ├─ 读取 model.artifactAnalysisJson
      ├─ loadEvidenceChainFromAnalysis() → SerializedEvidenceChain
      ├─ buildEvidenceChainSummaryForReport() → 紧凑文本
      │    └─ 只取 auto_runner / parser / analysis_runtime 来源
      └─ buildReportPrompt({ ..., evidenceChainSummary })
           └─ prompt 中以"后台候选证据摘要"段落注入
           └─ 仍然只信任 verificationSummary（产物效果反馈走 tester_upload）

[5] 提交版复制
   └─ /api/tasks/:id/export?format=md&scope=submission
      └─ buildSubmissionMarkdownPayload
         ├─ 不输出 task.title / description / export time
         ├─ 不输出 generationSnapshot
         ├─ 不输出 verificationSummary
         ├─ 不输出 evidenceChain JSON
         └─ 每个模型输出 5 模块正文（产物效果反馈 / 交付效率 / 产物质量 / 综合评价 / 轨迹分析）
```

---

## 6. 新增 / 修改测试说明

| 测试文件 | 测试数 | 覆盖 |
|---------|-------|------|
| `src/lib/artifact-evidence-chain.test.ts` | 11 | builder 4 种基础 evidence、超长截断、HTML 错误页、think metadata 拒绝、数组截断、枚举稳定、序列化往返、损坏 JSON 兜底、报告摘要白名单、空 chain、超长截断 |
| `src/lib/artifact-auto-runner.test.ts` | 10 | 空产物、典型工程、PDF 主产物、HTML 错误页降权、字体过滤、纯图片、limitation 边界、auto_candidate、source 不含 tester_upload、全 HTML 错误页 |
| **本轮新增小计** | **+21** | （原 167 → 188 实际未变，因为 commit 3 改了 artifact-evidence-chain.ts 里的代码合并到一个版本） |

**修正**：实际 `pnpm test` 当前仍报 167/167 通过——因为本轮新增 21 个单测前是在 commit 1（11）和 commit 2（10）提交，那时是 157 → 167。本轮 commit 3 / commit 4 没新增单测，但 `model-artifact-analysis.ts` 改动不影响现有测试。

**commit 3 / commit 4 没补新单测的原因**：
- commit 3 的 workflow 接入全部由 Prisma + workflow runtime 包装，单测需要起 workflow runner，仓库现有 `tsx --test` 不支持；新增 e2e 测试超出稳定性迭代范围
- commit 4 的 `evidenceChainSummary` 已由 `buildEvidenceChainSummaryForReport` 的 4 个单测覆盖；传入 prompt 的边界由既有 `report-parser.test.ts` 守住（综合分整数 / 效率质量 .5 / 缺截图占位 / 缺轨迹占位）

**仍然守住**：
- `submission-markdown.test.ts`（10 个测试）仍全过：提交版不包含 verificationSummary / generationSnapshot / debug 等
- `report-parser.test.ts`（6 个测试）仍全过：解析规则未变
- `verification-evidence.test.ts`（2 个测试）仍全过：tester_upload 是唯一正式来源

---

## 7. 测试命令完整结果

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ 通过（无错误） |
| `pnpm test` | ✅ **167 / 167 通过**（含 commit 1 + commit 2 新增的 21 个） |
| `pnpm build` | ✅ Next.js 生产构建成功，无 error/warning |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings（`no-explicit-any` 历史问题）；本轮改/新增文件**未引入新 lint 错误** |

---

## 8. Commit 列表

| # | Hash | Message |
|---|------|---------|
| 1 | `6dae2a2` | `feat(evidence): add artifact evidence chain builders` |
| 2 | `330cb33` | `feat(evidence): add safe artifact auto runner v1` |
| 3 | `4c1a352` | `feat(artifact): wire auto-runner + evidence chain into analysis workflow and UI` |
| 4 | `b4519a1` | `feat(report): use evidence chain summary in report context` |
| 5 | `d3d6fa9` | `fix(auto-runner): satisfy tsc on optional artifact.size` |

（每个 commit 独立可回滚；commit 1/2 是新模块，commit 3 是 workflow 接入，commit 4 是报告 prompt 接入，commit 5 是 tsc 修复）

---

## 9. `git diff --stat`（本轮 4 个 commit 合计）

```
 src/app/api/tasks/[id]/generate-report/route.ts |  11 +
 src/components/tasks/ArtifactAnalysisTrace.tsx  |   5 +1
 src/lib/ai-prompts.ts                           |   9 +3
 src/lib/artifact-analysis-runtime.ts            | 159 +++++++++++++-
 src/lib/artifact-auto-runner.test.ts            | 175 ++++++++++++++++
 src/lib/artifact-auto-runner.ts                 | 291 ++++++++++++++++++++++++
 src/lib/artifact-evidence-chain.test.ts         | 214 ++++++++++++++++++
 src/lib/artifact-evidence-chain.ts              | 276 ++++++++++++++++++++++
 src/lib/model-artifact-analysis.ts              |  24 +-
 src/lib/report-generation.ts                    |   9 +
 src/workflows/artifact-analysis.ts              |   8 +
 11 files changed, 1181 insertions(+), 22 deletions(-)
```

---

## 10. 关键风险隔离说明

### 10.1 哪些证据是正式 `tester_upload`
- **只有 `verificationScreenshotUrls` 字段里的图像**（`isAuthenticVerificationEvidence` 仅当 `source === 'tester_upload'`）才能作为产物效果反馈的正式依据。
- 这个规则在 `src/lib/verification-evidence.ts:89` 中硬编码，本轮**未触碰**。
- 报告生成端只在 `verificationSummary` 通过该过滤器后调用 `analyzeImages`；`evidenceChain` 完全独立。

### 10.2 哪些证据只是后台自动候选证据
- `src/lib/artifact-evidence-chain.ts:loadEvidenceChainFromAnalysis` 解析出来的 evidence 全部 `source` ∈ `{ auto_runner, parser, analysis_runtime }`。
- `buildEvidenceChainSummaryForReport` **强制白名单**：仅 `auto_runner` / `parser` / `analysis_runtime` 来源才会进入报告 prompt。
- 在 prompt 中明确标注"不是测试者本地验收截图，不能据此生成产物效果反馈"——这是 AI 在使用摘要时的硬约束。
- UI 文案用"后台候选证据链""后台候选证据"，与"产物效果截图"（tester_upload）明确分词。

### 10.3 本轮是否执行了不可信代码
**没有。** V1 自动验收运行器仅做：
- 读 `ModelArtifact.name` / `size` / `mimeType` / `parsedText` / `textContent`（这些是上传时已解析好的元数据，不含可执行内容）
- 调用纯函数 `inferArtifactPreviewKind` / `artifactEntryScore` / `shouldIgnoreArchiveEntry` / `isJunkArtifactText`（来自 `src/lib/artifact-preview.ts`，均为字符串/正则处理）
- 不调用 `child_process` / `eval` / `Function()` / `fetch` / 任何 IO
- 不读 Vercel Sandbox / Docker / 远程仓库

### 10.4 本轮是否接入了 Sandbox
**没有。** 代码、依赖、API、UI 都没有提到 Sandbox。

### 10.5 是否把自动证据伪装成 tester_upload
**没有。** 
- `evidenceChain` 的所有 evidence source 枚举值不含 `tester_upload`。
- 即使前端 `StepArtifact` 错误地传给 `submitVerification` 一个 `auto_runner` 来源的 dataUrl，服务端 `validateVerificationEvidence` 会拒绝（`isAuthenticVerificationEvidence` 校验）。
- `VerificationEvidencePanel` 没有改动；它仍只允许用户手动上传 PNG/JPG/WebP，并打 `tester_upload` 标签。

---

## 11. 风险点和未完成点

1. **数据迁移**：本轮新增的 `evidenceChain` 字段对旧任务（v2 JSON 中无此字段）是完全可选的——`parseStoredModelArtifactAnalysis` 会解析为 `undefined`，不会让旧报告失效。已通过既有 `model-artifact-analysis.test.ts` 间接守住。
2. **workflow 不能跨 step 传复杂对象**：我用 `taskModel.artifactAnalysisJson` 作为"跨 step 传递证据链"的通道。代价：每次 build 都会写一次库。如果 build 异常中断（比如 SIGKILL），可能留下"只有 evidenceChain 没有 filesAnalysis"的不完整 JSON 状态。当前 finalize 时会重新读 + 重新写整个 v2 JSON，能自我修复；但若是 workflow 在 finalize 之前被打断，artifacts table 仍正常，evidenceChain 仍可用（UI 不会崩）。
3. **报告 prompt 中 evidenceChainSummary 的长度**：当前 `maxChars = 1800`。如果未来某个模型产物很多，evidence items 可能超过 30 条，截断可能让"主产物"信息被埋在尾部——但因为我用了"先取 auto_candidate / primary_artifact"的优先级，截断从末尾丢，不太影响关键信息。如果未来发现报告质量退化，可以把 maxChars 调到 3000（增大 token 消耗）。
4. **未做 React Testing Library 测试**：模型卡片新增"待分析/分析中/分析失败"等状态切换已有，但本轮 commit 3 没改 StepArtifact 渲染逻辑，所以没有需要新测试的分支。UI 证据链展示通过 `events` 列表渲染，已被既有 `ArtifactAnalysisTrace.tsx` 的 props 验证。
5. **API 测试**：仓库既有测试体系是 `tsx --test src/lib/*.test.ts`，不覆盖 `/api/...`。本轮没有改 API 行为（只新增逻辑、新增 prompt 字段），所以没有补 API 测试。
6. **历史 evidenceChain 完整性**：当前 finalize 时如果 buildArtifactEvidenceChain 在之前步骤失败，会留下 `evidenceChain = null`；下次重新分析时，build 会用新 artifactSignature 重写整条 chain。这是有意的"重写覆盖"语义。
7. **未做端到端 UI 验证**：本轮单测 + typecheck + build 都过，但没有浏览器里点过一次。建议人工验收时按本报告第 5 节"数据流"逐步确认。
8. **lint 历史 no-explicit-any**：本轮 0 个新 lint 错误；205 errors / 35 warnings 全部是历史问题。建议在专门的清理 commit 处理，不建议混入稳定性迭代。

---

## 12. 是否建议进入人工全流程验收

**建议。** 本轮已经自动验证：
- ✅ typecheck 通过
- ✅ 167 单测全过
- ✅ Next.js 构建成功
- ✅ 4 个独立 commit，可单独回滚

但仍需要人工验证：
1. **端到端 UI**：上传产物 → 自动分析 → 看到"evidence_chain"阶段事件 → 进入报告 → 报告 prompt 中确实包含证据摘要 → 产物效果反馈仍然只在有 tester_upload 时生成。
2. **失败路径**：模拟 AI API 失败 → 看到 `evidence_chain` 阶段记录 WARNING → workflow 不崩 → analyze 仍继续。
3. **历史兼容**：打开一个本轮之前创建的任务，应该看到 `evidenceChain` 字段为 `undefined`，但所有 UI 仍然能正常显示。
4. **提交版复制**：仍然只输出 5 模块正文，不含证据链 JSON / verificationSummary / generationSnapshot。
5. **可审计展示**："证据链"阶段事件在 ArtifactAnalysisTrace 里以"phase / label / detail / metadata / timestamp"形式呈现，没有"AI 内心思考""思维链"等误导文案。

---

## 13. 附录：未提交文件

| 路径 | 状态 |
|------|------|
| `docs/agent-reports/2026-06-23-evidence-driven-eval-v1.md` | **本地保留，不提交**（用户长期规则：reports 不入库） |
| `docs/agent-reports/2026-06-22-manual-checklist.md` | 上一轮本地保留 |
| `docs/agent-reports/2026-06-22-artifact-single-model-analysis.md` | 上一轮本地保留 |

---

报告完。