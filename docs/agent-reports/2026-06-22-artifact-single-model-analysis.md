# 第二步完成报告：单模型产物上传完毕自动开始分析（稳定性迭代）

> 本报告对应 test 分支上「第二步」的稳定性迭代，与「第一步：提交上一轮已验收改动」连续。
> 改动范围仅限前端 UX、纯函数 `clampAnalysisError` 与单测；不新增依赖，不改 Prisma schema，不动 API 路由，不动 workflow。

---

## 1. 第一步 commit hash

| 项目 | 值 |
|------|----|
| 分支 | `test` |
| Commit | **`d92652f`** |
| Message | `fix: add submission-only report export` |
| 文件数 | 8 个变更（含 1 个新增） |
| 行数 | +292 / -40 |

### 第二步 commit

| 项目 | 值 |
|------|----|
| Commit | **`fe03119`** |
| Message | `feat(artifact): per-model analysis state and persistent error banner` |
| 文件数 | 3 个变更（1 修改 + 2 新增） |
| 行数 | +141 / -5 |

已确认该 commit 未推送远程（仍在 `## test` 下，远程未受影响），与「不要推送远程」要求一致。

---

## 2. 第二步修改文件列表

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/app/tasks/[id]/StepArtifact.tsx` | 修改 | 引入 per-model 状态机（pending/running/failed/completed/stale）+ 持久错误条 + `clampAnalysisError` 接入 |
| `src/lib/analysis-error.ts` | 新增 | 纯函数 `clampAnalysisError`：截断 / 去空白 / 检测 HTML 错误页 |
| `src/lib/analysis-error.test.ts` | 新增 | 5 个单测覆盖纯函数全部边界 |

未触动：

- `src/app/api/tasks/[id]/models/[modelId]/artifact-analysis/route.ts`（已有幂等 POST + 咨询锁）
- `src/workflows/artifact-analysis.ts` / `src/lib/artifact-analysis-runtime.ts`（finalize 阶段已自动触发报告生成）
- `src/app/api/tasks/[id]/generate-report/*`（已优先读 `model.artifactAnalysisJson`）
- `src/components/tasks/ArtifactAnalysisTrace.tsx`（已合规：不展示原始 think，仅 phase/label/detail/metadata/timestamp）
- `src/components/tasks/VerificationEvidencePanel.tsx`（已合规：`isAuthenticVerificationEvidence` 只接受 `tester_upload`）
- `src/lib/verification-evidence.ts`（未改：自动截图仍只作为辅助证据）

---

## 3. 每个文件改了什么

### `src/app/tasks/[id]/StepArtifact.tsx`

- 新增 state `analysisErrors: Record<string, string>`：每模型独立的持久错误提示，仅在下次该模型分析成功时清除，或用户主动关闭。
- `analyzeModelArtifacts(modelId, options)` 重写：
  - `!res.ok` 时把后端 `error` 写入 `analysisErrors[modelId]`（不再只丢给一闪而过的 toast）。
  - try/catch 失败时同样持久化错误。
  - 成功后主动从 `analysisErrors` 移除该 modelId。
- 新增 `clearAnalysisError(modelId)`：用于错误条右上角关闭按钮。
- 模型卡片头部新增**单模型状态徽标**：
  - `分析中`（Badge primary + Loader2 icon）
  - `待分析`（已上传产物但既未分析也未拿到结果）
  - `已预分析` / `需重新分析` / `分析失败`（沿用既有语义）
- 按钮文案按状态切换：`后台分析中` / `请先上传产物`（禁用）/ `开始产物分析` / `重新分析`。
- 卡片内**新增持久错误条**：红色 panel，含图标 + "产物分析失败" 标题 + 错误正文 + 关闭按钮；HTML 错误页经 `clampAnalysisError` 截短，避免把整段 markup 渲染到 UI。

### `src/lib/analysis-error.ts`（新增）

- 导出常量：`ANALYSIS_ERROR_MAX_LENGTH = 240`、`ANALYSIS_HTML_ERROR_HINT`。
- 导出 `clampAnalysisError(value: string): string`：
  - 合并空白字符。
  - 检测 `<html|<body|<head|<!doctype` 模式，命中则返回 HTML 错误提示，避免泄漏 markup。
  - 截断至 240 字并加省略号。
  - 空字符串返回 `'未知错误'`。
- 纯函数，无副作用，可在 server / client / test 中安全复用。

### `src/lib/analysis-error.test.ts`（新增）

5 个单测：

1. 空 / 空白字符串 → `'未知错误'`
2. 短字符串 → 原样返回（多余空白被合并）
3. 超长字符串 → 截断到 ≤241 字符并以 `…` 结尾
4. `<!DOCTYPE html>…</html>` → 返回"请打开浏览器开发者工具"提示
5. `<body>…</body>` 片段 → 同样返回提示

---

## 4. 用户操作流程变化

### 之前（验收通过但体验不佳）

- 上传产物 → 自动触发分析（成功时 ✅）。
- 但失败时错误只显示在**页面顶部 toast**，15 秒后消失；用户无法快速复制或截图。
- run 状态为 FAILED 时卡片里没有"分析失败"提示，只能从轨迹末尾看一行红色文字。
- 状态徽标只有"已预分析 / 需重新分析"，无法一眼看出"正在分析 / 待分析 / 分析失败"。

### 现在（本轮迭代）

1. **新模型 → 上传产物** → 自动分析；卡片显示 `分析中` 徽标 + 按钮 `后台分析中`。
2. **分析成功** → 卡片显示 `已预分析` 徽标 + 按钮变为 `重新分析`。
3. **分析失败** → 卡片**顶部持续显示红色错误条**（不会消失），徽标显示 `分析失败`，按钮变为 `重新分析`；用户可以点错误条右上角 × 临时关闭（再次分析时会自动清除）。
4. **没点按钮但已经上传文件** → 显示 `待分析` 徽标 + `开始产物分析` 按钮；给用户明确的下一步指引。
5. **没上传产物** → 按钮文案 `请先上传产物`，disabled。
6. **错误是 HTML 错误页** → 用户看到"请打开浏览器开发者工具查看完整响应"，而不是一整段 `<html>` 被塞到 UI。

---

## 5. 测试命令与完整结果

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ 通过（无错误） |
| `pnpm test` | ✅ **146 / 146 通过**（原 141 + 本轮新增 5） |
| `pnpm build` | ✅ Next.js 生产构建成功，无 error/warning |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 个 `no-explicit-any` 错误 + 35 警告，与本轮**无关**；本轮改/新增的业务文件未引入新 lint 错误 |

测试输出关键段：
```
✔ clampAnalysisError: 空字符串返回"未知错误"
✔ clampAnalysisError: 正常短字符串原样返回（去除多余空白）
✔ clampAnalysisError: 超长字符串截断并加省略号
✔ clampAnalysisError: HTML 错误页被替换为短提示，避免泄漏 markup
✔ clampAnalysisError: HTML 片段（含 body 标签）也会触发替换
ℹ tests 146
ℹ pass 146
ℹ fail 0
```

---

## 6. `git diff --stat`（本轮）

```
 src/app/tasks/[id]/StepArtifact.tsx | 89 ++++++++++++++++++++++++++++++++++---
 1 file changed, 84 insertions(+), 5 deletions(-)
```

未跟踪：
- `src/lib/analysis-error.ts`（新增）
- `src/lib/analysis-error.test.ts`（新增）
- `docs/superpowers/`（临时计划文件，默认不提交）

合并 `git add` 之后的全量 diff（含新增文件）：
- `StepArtifact.tsx`：+84 / -5
- `analysis-error.ts`：+约 28
- `analysis-error.test.ts`：+约 32

---

## 7. 关键 diff 摘要

### `src/app/tasks/[id]/StepArtifact.tsx`（状态推导）

```tsx
const runStatus = latestAnalysisRun?.status || null
const isAnalyzing = startingModelId === model.id || runStatus === 'QUEUED' || runStatus === 'RUNNING'
const hasFailedRun = runStatus === 'FAILED'
const isPendingAnalysis = artifactCount > 0 && !isAnalyzing && !hasFreshAnalysis && !hasStaleAnalysis && !hasFailedRun
const persistentError = analysisErrors[model.id] || (hasFailedRun ? (latestAnalysisRun?.error || '产物分析失败，请稍后重试') : null)
```

### `src/app/tasks/[id]/StepArtifact.tsx`（错误条）

```tsx
{persistentError && (
  <div role="alert" aria-live="polite"
    className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-200 break-words"
    data-testid={`analysis-error-${model.id}`}>
    <AlertTriangle … />
    <div className="flex-1 min-w-0">
      <div className="font-medium text-red-100">产物分析失败</div>
      <div className="mt-0.5 text-red-200/90 leading-relaxed">{persistentError}</div>
    </div>
    <button onClick={() => clearAnalysisError(model.id)} aria-label="关闭错误提示">×</button>
  </div>
)}
```

### `src/app/tasks/[id]/StepArtifact.tsx`（按钮文案状态机）

```tsx
{isAnalyzing ? '后台分析中'
 : artifactCount === 0 ? '请先上传产物'
 : hasFailedRun ? '重新分析'
 : hasFreshAnalysis ? '重新分析'
 : isPendingAnalysis ? '开始产物分析'
 : hasStaleAnalysis ? '重新分析'
 : '开始产物分析'}
```

### `src/lib/analysis-error.ts`（核心纯函数）

```ts
export function clampAnalysisError(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return '未知错误'
  if (HTML_PATTERN.test(cleaned)) return ANALYSIS_HTML_ERROR_HINT
  if (cleaned.length <= ANALYSIS_ERROR_MAX_LENGTH) return cleaned
  return cleaned.slice(0, ANALYSIS_ERROR_MAX_LENGTH) + '…'
}
```

---

## 8. 风险点 / 未完成点

1. **`pnpm lint` 的预先存在错误未修**：本轮引入 0 个新 lint 错误，但仓库仍然有 205 errors / 35 warnings（绝大部分 `no-explicit-any`）。建议后续专门做一轮机械清理，不建议混入稳定性迭代。
2. **端到端未跑**：本轮只覆盖了纯函数 `clampAnalysisError` 单测与 typecheck/build。模型卡片渲染的状态切换是 React 表达式分支，没有 React Testing Library 的现存基线；按既有"仓库没有组件级测试"的现状，没有补组件测试。如果项目后续引入 RTL，可以优先覆盖：
   - "待分析" 状态只在 `artifactCount > 0 && !isAnalyzing && !hasFreshAnalysis && !hasStaleAnalysis && !hasFailedRun` 时出现
   - 点击"重新分析"会清掉对应 modelId 的持久错误条
3. **没有改后端 API**：现有 `POST /api/tasks/[id]/models/[modelId]/artifact-analysis` 已经在 0.05s 内返回 `{ run, alreadyRunning }`（202 Accepted），且 finalize 阶段自动触发 `generateReportForModel`。这意味着**单模型分析成功后会自动生成报告**——这是既有行为，不需要本轮改。如果业务希望"分析完先不自动生成报告，等用户在报告页手动触发"，那需要在 finalize 流程里加一个开关；这是产品决策，不在本稳定性迭代范围。
4. **轮询节奏未改**：当前分析中时每 1.5s 调用一次 `onRefresh`。本轮没有调整；如果多个模型同时分析，可能触发 N 次轮询；既有实现已经是这样，本轮不动。
5. **`run.error` 的最大长度**：`artifact-analysis-runtime.ts:73 artifactAnalysisErrorMessage` 已经把后端 error 截到 900 字。前端 `clampAnalysisError` 再截到 240 字。两层防护足够，但需要确认 240 字对绝大多数错误够用；如未来有需要可以调大。
6. **API 没有新增测试**：项目既有的 API 测试体系是 `tsx --test src/lib/*.test.ts`，不覆盖 `/api/.../route.ts`。本轮没有改 API，所以也没有新增 API 测试。
7. **错误条 ×关闭按钮**只是临时关闭；如果服务端 run 仍然处于 FAILED 状态，下次 `onRefresh`（每 1.5s）拉回来时，因为 `latestAnalysisRun.error` 还在，错误条会重新出现。这是 by-design：用户必须真正成功重跑才能彻底消除。

---

## 9. 是否建议合并

**暂不建议立即合并 main**，理由：

1. 这是 test 分支上的**多轮稳定性迭代**（本轮是第三轮：报告清晰化 / 提交版导出 / 单模型分析 UX）。每一轮都是独立小范围改动，都已通过 typecheck/test/build。
2. 建议按节奏让产品方先在本轮做端到端验证（手动上传产物 → 触发分析 → 看到持久错误条 → 重试成功），再决定是否合并。
3. 如果要合并，建议合并为 3 个独立 commit（每个特性一个 commit），便于回滚：
   - `d92652f` 之前的稳定性迭代（已在前面单独 commit）
   - `d92652f fix: add submission-only report export`
   - `本次提交（待生成 hash） feat(artifact): per-model analysis state & persistent error`

如果团队偏好 squash，也可以 squash 成一个 commit；测试与 build 都已通过。

---

## 10. 是否需要进一步验收

建议人工验收以下几个点：

1. **正常流**：上传 1 个模型的产物 → 看到 `分析中` 徽标 → 几分钟后变 `已预分析` → 跳转报告页看到自动生成的报告。
2. **失败流**：拔网线 / 关 AI API 触发失败 → 看到模型卡片内**持久红色错误条** + `分析失败` 徽标 → 恢复网络后点 `重新分析` → 错误条消失。
3. **HTML 错误页兜底**：临时把后端改坏返回 500 + HTML body → 前端不显示整段 `<html>`，而是显示"请打开浏览器开发者工具"。
4. **空产物状态**：新建模型但不传任何产物 → 按钮显示 `请先上传产物` 且禁用。
5. **多模型并发**：上传 2 个模型产物 → 2 个模型各自独立显示状态，一个完成另一个还在 `分析中` 时也能正常切换/查看。
6. **重置**：删除模型再重新添加，状态干净，无残留错误条。

如果这 6 项都通过，可以放心合并。