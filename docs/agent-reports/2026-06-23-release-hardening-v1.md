# Release Hardening V1 — 完成报告

> test 分支上 V1.1 之后的发布防回归迭代。
> 不新增业务功能，不改 UI，不改 schema，不新增依赖；只做"自动验证脚本 + 跨模块回归测试 + 发布门禁清单"。
> **不提交 docs/agent-reports/，作为本地验收材料。**

---

## 1. 本轮做了什么

| 任务 | 状态 | 摘要 |
|------|------|------|
| 任务一 一键验证脚本 | ✅ | 新增 `scripts/verify-release.js`（纯 Node 内置，零依赖）；`package.json` 增加 `"verify:release": "node scripts/verify-release.js"` |
| 任务二 补充回归测试 | ✅ | 新增 `src/lib/release-regression.test.ts`，12 个跨模块回归断言；既有覆盖已充分，没重复堆测试 |
| 任务三 低风险 lint 收敛 | ✅ | 本轮新增文件零 `any`；不需要修旧文件 |
| 任务四 发布门禁文档 | ✅ | 本报告 |

---

## 2. 新增脚本说明：`scripts/verify-release.js`

### 2.1 行为
- 跨平台：Windows / macOS / Linux。Windows 上自动加 `shell: true` 与 `.cmd` 候选（pnpm/npm 在 Windows 上是 .cmd）。
- 自动检测 runner：优先 pnpm，回退 npm；找不到任一则抛错退出。
- 依次执行三个阶段（阶段间无重叠）：
  1. `pnpm test`（lib 单测）
  2. `pnpm typecheck`（`tsc --noEmit`）
  3. `pnpm build`（Next.js 生产构建）
- 任一阶段失败立即以非 0 退出，后续阶段不再继续。
- 输出阶段日志：
  - 阶段名 / 起始时间
  - 退出码 / 耗时
  - 整体 PASSED / FAILED

### 2.2 用法

```bash
pnpm verify:release
# 或
node scripts/verify-release.js
```

期望退出码：`0` = 全通过；`非 0` = 至少一项失败。

### 2.3 设计原则
- **零新增依赖**：仅使用 Node 内置 `child_process` / `process` / `console`。
- **跨平台兼容**：检测 `.cmd` 后缀、Windows shell 模式、pnpm/npm fallback。
- **阶段隔离**：每阶段独立计时、独立日志；失败立即停止避免掩盖根因。
- **包管理器兼容**：未来如果用户切换到 bun / yarn，只需在 candidates 数组里追加候选。

### 2.4 实际跑结果（Windows + pnpm）
```
Release verification started
node=v24.13.0
platform=win32 x64

▶ 运行单测（pnpm test）
  exit=0  elapsed=4.1s
✓ unit-tests 通过

▶ 运行类型检查（pnpm typecheck）
  exit=0  elapsed=6.3s
✓ typecheck 通过

▶ 运行生产构建（pnpm build）
  exit=0  elapsed=55.5s
✓ build 通过

✓ Release verification PASSED in 66.6s
```

---

## 3. 新增 / 修改测试说明

### 3.1 新增：`src/lib/release-regression.test.ts`（12 个测试）

把分散在多个文件里的"硬规则"集中交叉验证一遍，避免单点回归：

| # | 测试 | 跨模块交叉断言 |
|---|------|----------------|
| 1 | 提交版不输出 generationSnapshot / verificationSummary / 证据链 JSON | `buildSubmissionMarkdownPayload` × 内容白名单 |
| 2 | 提交版多模型按输入顺序输出 | `buildSubmissionMarkdownPayload` × 顺序稳定性 |
| 3 | parser 拒绝非法 evidenceType / source 并保持稳定 | `parseStoredEvidenceChain` × `EVIDENCE_TYPE_VALUES` 枚举 |
| 4 | parser 不会因为损坏 JSON 而抛错 | `parseStoredEvidenceChain` × 容错性 |
| 5 | tester_upload / artifact_upload 永不进入报告 prompt 摘要 | `buildEvidenceChainSummaryForReport` × source 白名单 |
| 6 | file_manifest 不挤占 token；primary_artifact 排在前 | `buildEvidenceChainSummaryForReport` × 优先级 + 限长 |
| 7 | 无 tester_upload 时产物效果反馈必须是占位语；解析器拒绝其它写法 | `parseReportStrict` × 占位语硬约束 |
| 8 | 有 tester_upload 时产物效果反馈必须是真实内容，不能写成占位 | `parseReportStrict` × 反向约束 |
| 9 | 综合分必须 1-10 整数，效率/质量可 .5 | `parseReportStrict` × 评分类型约束 |
| 10 | auto runner V1 边界 — 未执行不可信代码 / 未接 Sandbox 必须在 limitation 里 | `runSafeArtifactAutoRunner` × V1 边界硬表达 |
| 11 | auto runner 过滤 node_modules / 字体 / HTML 错误页 | `runSafeArtifactAutoRunner` × 主产物识别降权 |
| 12 | auto runner 不会输出 source === tester_upload 的 evidence | `runSafeArtifactAutoRunner` × source 隔离 |

### 3.2 没重复堆的测试

任务描述说"如果已有测试覆盖充分，不要重复堆测试"。本轮严格遵守：

- submission-only 已有 `submission-markdown.test.ts`（11 个），**未重复**。本轮跨模块测试只测"多模块白名单"的交叉断言（属于不同角度）。
- evidence chain 已有 `artifact-evidence-chain.test.ts`（22 个），**未重复**单测逻辑；本轮新测只做跨模块"白名单 / 优先级 / 容错"。
- auto runner 已有 `artifact-auto-runner.test.ts`（10 个），**未重复**；本轮新测只强化"安全边界 / source 隔离"。
- report parser 已有 `report-parser.test.ts`（6 个），**未重复**；本轮新测只覆盖"综合分必须整数 / .5 步长"的反向断言。

### 3.3 测试统计

| 状态 | 测试文件 | 测试数 |
|------|---------|--------|
| 既有 | 各 lib/*.test.ts | 178 |
| 本轮新增 | `release-regression.test.ts` | 12 |
| **总计** | 5 个 suites | **190 / 190 通过** |

---

## 4. 自动验证结果

| 命令 | 结果 |
|------|------|
| `pnpm verify:release` | ✅ PASSED in 66.6s |
| └ `pnpm test` | ✅ 190/190 通过 |
| └ `pnpm typecheck` | ✅ 通过 |
| └ `pnpm build` | ✅ Next.js 生产构建成功 |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings（`no-explicit-any` 历史问题）；本轮新增/修改文件**未引入新 lint 错误** |

测试覆盖一览：

- `release-regression.test.ts` — 12 个（跨模块回归断言）
- `artifact-evidence-chain.test.ts` — 22 个
- `artifact-auto-runner.test.ts` — 10 个
- `analysis-error.test.ts` — 5 个
- `submission-markdown.test.ts` — 11 个
- 既有其它 lib 测试 — 130 个
- **总计：190 / 190**

---

## 5. 当前 test 分支 commit 列表（自 main HEAD `ede344b` 起的 14 个 commit）

| # | Hash | Message |
|---|------|---------|
| 1 | `d92652f` | `fix: add submission-only report export` |
| 2 | `fe03119` | `feat(artifact): per-model analysis state and persistent error banner` |
| 3 | `6dae2a2` | `feat(evidence): add artifact evidence chain builders` |
| 4 | `330cb33` | `feat(evidence): add safe artifact auto runner v1` |
| 5 | `4c1a352` | `feat(artifact): wire auto-runner + evidence chain into analysis workflow and UI` |
| 6 | `b4519a1` | `feat(report): use evidence chain summary in report context` |
| 7 | `d3d6fa9` | `fix(auto-runner): satisfy tsc on optional artifact.size` |
| 8 | `f6ba3f0` | `feat(evidence): harden evidence summary and parser` |
| 9 | `ead22ad` | `feat(evidence): add evidence chain detail panel` |
| 10 | `d3b1c22` | `test(evidence): cover evidence UI helpers and report summary` |
| 11 | `fe0ff18` | `fix(evidence): allow buildEvidence to accept optional createdAt for tests` |
| 12 | `4a8e9c3` | `test(evidence): bypass source whitelist in tester_upload rejection test` |
| 13 | **`70e01fe`** | **`chore(release): add release verification script`**（本轮新增） |
| 14 | **`098b63f`** | **`test: harden evidence and report regression coverage`**（本轮新增） |

---

## 6. `git diff --stat`（自 main 累计）

```
 package.json                                       |   1 +
 scripts/verify-release.js                          | 122 ++++++
 src/app/api/tasks/[id]/export/route.ts             |  84 +++-
 src/app/api/tasks/[id]/generate-report/route.ts    |  16 +-
 src/app/tasks/[id]/StepArtifact.tsx                | 106 ++++-
 src/app/tasks/[id]/StepReport.tsx                  |   9 +-
 src/app/tasks/[id]/page.tsx                        |   8 +-
 src/components/tasks/ArtifactAnalysisTrace.tsx     |   6 +
 src/components/tasks/ArtifactEvidenceChainPanel.tsx| 219 +++++++++
 src/lib/ai-prompts.ts                              |  41 +-
 src/lib/analysis-error.test.ts                     |  31 ++
 src/lib/analysis-error.ts                          |  26 ++
 src/lib/artifact-analysis-runtime.ts               | 159 ++++++-
 src/lib/artifact-auto-runner.test.ts               | 175 ++++++++
 src/lib/artifact-auto-runner.ts                    | 292 ++++++++++++
 src/lib/artifact-evidence-chain.test.ts            | 398 +++++++++++++++++
 src/lib/artifact-evidence-chain.ts                 | 488 +++++++++++++++++++++
 src/lib/model-artifact-analysis.ts                 |  24 +-
 src/lib/release-regression.test.ts                 | 369 ++++++++++++++++
 src/lib/report-generation.ts                       |  13 +-
 src/lib/submission-markdown.test.ts                | 180 ++++++++
 src/workflows/artifact-analysis.ts                 |   8 +
 22 files changed, 2726 insertions(+), 49 deletions(-)
```

---

## 7. 仍需人工验收的项目

V1.1 之后需要人工的验收清单仍然有效（本报告只增加自动化防回归能力，不改变 V1.1 的人工验收项）。简化版：

### 必做（4 项）

1. **新建任务 → 上传产物 → 自动分析**：看到"分析中"→"已预分析" 状态切换；空产物模型按钮显示"请先上传产物"且 disabled。
2. **证据链 UI**：模型卡片里出现"证据链"折叠面板，按 主产物识别 / 文件清单 / 解析证据 / 结构检查 / 质量信号 / 后台候选证据 / 限制与风险 / 错误 顺序展示；顶部黄色提示条出现。
3. **报告生成与产物效果反馈**：不传 tester_upload → 产物效果反馈写"未上传产物效果截图，暂无法填写产物效果反馈。"；交付效率 / 产物质量 / 综合评价可引用证据摘要；轨迹分析无轨迹截图时写"未提供轨迹截图。"。
4. **复制 MD**：只含 5 模块正文；不含任务标题 / 描述 / 导出时间 / 评分概览 / verificationSummary / 证据链 JSON / 系统调试信息 / raw think。

### 可选

5. 失败路径：临时关闭 AI API → 看到持久红色错误条；HTML 错误页被替换为短提示。
6. 多模型并发：各自独立状态与错误条。
7. 旧任务兼容：V1 之前创建的任务，UI 显示"尚未生成证据链，请先分析产物。"。

---

## 8. 合并 main 前门禁

| 项 | 状态 | 说明 |
|------|------|------|
| `pnpm verify:release` 通过 | ✅ | 已自动跑过 |
| 源码工作树相对 HEAD 干净 | ✅ | 仅 `docs/agent-reports/` 未跟踪（按长期规则） |
| Prisma schema 未变 | ✅ | 全程未碰 schema |
| 新增依赖 = 0 | ✅ | `verify-release.js` 仅用 Node 内置 |
| main 最近是否有新提交？ | 需用户确认 | `git fetch` 后确认 |
| 合并策略 | 建议 `--no-ff` | 保留 test 分支结构 |
| 回滚演练 | 见 V1.1 报告 | 按 4 个特性 commit 分批 revert |

---

## 9. Vercel 部署前门禁

| 项 | 状态 | 说明 |
|------|------|------|
| Node 版本 | 检查 `.nvmrc` | 仍为 v22 |
| 环境变量 | 无新增 | 现有 `DATABASE_URL` / `DIRECT_URL` / `SESSION_PASSWORD` 等不需要改 |
| 数据库迁移 | **不需要** | schema 未动 |
| Workflow runtime | 现有 | 新增 step `buildEvidence` 仍走 `'use step'`，与既有 runtime 兼容 |
| Edge runtime | 无影响 | `route.ts` 仍为 `runtime = 'nodejs'` |
| 构建命令 | `pnpm build` | 与现有完全一致 |
| 函数超时 | 不变 | `maxDuration = 300`（已有） |
| Vercel CLI 部署命令 | `vercel --target=preview --branch=test` | 推荐先 preview |

部署后立即做：

1. 打开 preview URL，跑一遍第 7 节"必做"4 项。
2. 检查 Vercel Functions 日志没有 `evidence_chain` 相关错误。
3. 检查 workflow runs 没有 stuck。

---

## 10. 风险点和未完成点

1. **`verify-release.js` 仅在 Windows + pnpm 11 上验证过**：虽然代码用了跨平台 shell + .cmd fallback，但 macOS / Linux 上没真正跑过。建议在跨平台 CI 上验证一次（如果未来引入 CI）。
2. **`pnpm test` 仍然只跑 `src/lib/*.test.ts`**：本轮新增的 `release-regression.test.ts` 被 glob 命中——但如果未来有人改测试目录结构（例如移去 `src/lib/release/`），本脚本不会自动跟随，需要更新 glob。**建议**未来若新增 test 目录，把 glob 改成更明确的形式（例如 `tsx --test src/**/*.test.ts`），但当前**不在本轮范围**。
3. **新增测试有 1 处使用 `as ReturnType<typeof buildEvidence>[]`**：因为 `tester_upload` / `artifact_upload` 不在 `EvidenceSource` 枚举里，要构造非法 source 测 parser 拒绝逻辑时只能 raw JSON 绕过类型。这是已知妥协，JSDoc 已注明。
4. **lint 历史问题仍未处理**：仓库 205 errors / 35 warnings 仍是历史 `no-explicit-any`。本轮新增/修改文件**零** lint 错误贡献。彻底清理建议专门做。
5. **没有跑端到端 UI 验证**：见第 7 节"仍需人工验收"。
6. **没有推送远程**（按用户长期规则保持）。

---

## 11. 建议下一步

- 合并前：跑 `pnpm verify:release`（已通过）；`git fetch` 确认 main 无新提交。
- 合并策略：`git checkout main && git merge --no-ff test`（保留分支结构，便于回滚）。
- 部署：先 preview，验证第 7 节"必做"4 项；再 push to production。
- 后续如果要做 V2：先做"产品方人工验收"——本轮已经把自动验证收敛到 `pnpm verify:release` 一条命令，下次发布只需跑这一个。

---

报告完。