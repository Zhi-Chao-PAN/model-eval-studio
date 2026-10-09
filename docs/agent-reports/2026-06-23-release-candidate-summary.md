# Test 分支发布候选说明 (Release Candidate Summary)

> **目的**：在 test 分支合并 main 之前，把当前累积的稳定性 + 证据链能力整理成可发布的快照，供人工核对、回滚演练与部署检查。
> **本报告不修改任何源码**，只读工作树状态、跑自动验证、生成检查清单。
> **不提交、不推送、不合并。**

---

## 1. 当前工作树状态

```
$ git status -sb
## test
?? docs/agent-reports/
```

工作树相对 HEAD 干净；只有本地 `docs/agent-reports/` 未跟踪（按长期规则不入库）。

## 2. 候选发布包含的 commit（自 `ede344b` 之后的 12 个 commit）

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

## 3. 候选发布包含的能力

### 3.1 报告生成与导出

- **提交版复制**（commit 1）：顶部"复制 MD"按钮改为调用 `/api/tasks/:id/export?format=md&scope=submission`，剪贴板只含每个模型的 5 模块正文；旧的完整 `format=md` 导出仍保留供下载使用。
- **产物效果反馈硬约束**：未上传正式 `tester_upload` 截图时，报告 prompt 与 UI 都明确写"未上传产物效果截图，暂无法填写产物效果反馈。"，绝不编造。
- **轨迹分析硬约束**：未上传执行轨迹时固定写"未提供轨迹截图。"。
- **报告生成 prompt 全部使用第一人称"我"的测试者口吻**；`buildReportRepairPrompt`（两个文件都同步）禁止"用户/测试者/测试人员"等第三人称称呼，禁止"建议用户/提交到平台后请填写/你需要"等面向读者的话。

### 3.2 产物提交阶段 UX

- **单模型状态徽标**（commit 2）：分析中 / 待分析 / 已预分析 / 需重新分析 / 分析失败 五态清晰。
- **持久错误条**：分析 API 失败时，红色错误条**持续显示**在该模型卡片内（不会自动消失），HTML 错误页被 `clampAnalysisError` 替换为短提示。
- **按钮文案状态机**：`后台分析中` / `请先上传产物` / `开始产物分析` / `重新分析`，按状态自动切换。

### 3.3 证据驱动评测系统 V1

- **artifact-evidence-chain**（commit 3、8、10）：纯 TS 数据结构 + builders + 序列化 + 报告摘要。
  - 8 种 evidenceType：`file_manifest` / `parsed_content` / `primary_artifact` / `structure_check` / `quality_signal` / `limitation` / `auto_candidate` / `error`
  - 4 种 source：`artifact_upload` / `parser` / `auto_runner` / `analysis_runtime`（**tester_upload 不在 evidenceChain 内**——属于产物效果截图独立通道）
  - parser 拒绝非法 type / source；metadata 超长字符串再次截断；缺失 createdAt 给稳定 fallback；损坏 JSON 不抛错
- **safe auto runner V1**（commit 4）：纯函数、零网络、零执行、零 npm install。
  - 主产物识别、文件清单、解析证据、结构检查、质量信号、后台候选证据、限制说明 7 类输出
  - HTML 错误页 / node_modules / 字体 / 缓存文件一律降权或过滤
- **workflow 接入**（commit 5）：在 `inspect` 之后 / 视觉解读之前插入 `buildEvidence` step；立即把 chain 写入 `taskModel.artifactAnalysisJson.evidenceChain`，由 `finalize` 时统一 attach 进 v2 JSON。

### 3.4 报告 prompt 引用证据链摘要

- `buildReportPrompt` 新增 `evidenceChainSummary` 字段（commit 6）。
- 摘要按 `REPORT_SUMMARY_TYPE_PRIORITY` 排序（primary_artifact 最先，file_manifest 最后），白名单 source（仅 `auto_runner` / `parser` / `analysis_runtime`），file_manifest 单条独立限长 360 chars。
- 顶部 banner 永远提示"后台候选证据，不等同于测试者本地验收截图，产物效果反馈仍需 tester_upload 截图"。

### 3.5 证据链详情 UI

- **ArtifactEvidenceChainPanel**（commit 9）：在 StepArtifact 模型卡片里，紧跟 ArtifactAnalysisTrace 之后。
  - 未生成证据链 → 占位"尚未生成证据链，请先分析产物。"
  - 有证据链 → 折叠面板，按 8 组稳定分组，主产物识别与限制与风险默认展开
  - 每条证据展示 title / summary / 类型徽标 / source 中文标签 / artifactName / createdAt / metadata 关键字段（自动过滤 think / reasoning / chain_of_thought）
  - 顶部黄色提示条明确"后台候选证据可参考交付效率/产物质量/综合评价，不等同于测试者本地验收截图"

### 3.6 测试覆盖

| 测试文件 | 测试数 | 说明 |
|---------|-------|------|
| `artifact-evidence-chain.test.ts` | 22 | builder、parser 健壮性、分组、摘要排序、来源白名单 |
| `artifact-auto-runner.test.ts` | 10 | 主产物识别、HTML 错误页降权、字体过滤、纯图片、limitation 边界 |
| `analysis-error.test.ts` | 5 | HTML 错误页截断、超长截断 |
| `submission-markdown.test.ts` | 10 | 提交版只输出 5 模块正文，不含 generationSnapshot / verificationSummary / 调试信息 |
| **既有所有 lib 测试** | 其余 131 | 解析、评分、限流、校验等 |
| **总计** | **178 / 178 通过** | |

---

## 4. 哪些能力仍未完成 / 已知风险

1. **React Testing Library 未覆盖**：仓库现有测试体系是 `tsx --test src/lib/*.test.ts`，不跑 React 组件；`ArtifactEvidenceChainPanel` 与 StepArtifact 渲染逻辑没有组件级单测。
   - 风险：UI 折叠/展开/分组排序逻辑如果将来回归，现有单测无法捕捉。
   - 缓解：核心 helper（`groupEvidenceByType` / `parseStoredEvidenceChain` / `buildEvidenceChainSummaryForReport`）都有纯函数单测；UI 只是把这些 helper 映射到 DOM。
2. **API 测试覆盖不足**：仓库既有的 `tsx --test` 不跑 `/api/.../route.ts`。本次没有改 API 行为，但 workflow / artifact-analysis API 缺少直接 API 测试。如果未来重构这部分，建议补 e2e。
3. **历史 lint 噪声未处理**：仓库存在 205 errors / 35 warnings（绝大部分 `no-explicit-any`），与本轮无关；建议在专门清理 commit 处理，不建议混入发布候选。
4. **端到端 UI 验证未跑**：自动验证（typecheck / 178 单测 / build）都过，但没在浏览器里逐项点开确认。
5. **workflow 不能跨 step 传复杂对象**：当前用 `taskModel.artifactAnalysisJson.evidenceChain` 作为"跨 step 传值通道"，每次 build 都写一次库。如果 build 在 finalize 之前被 SIGKILL 打断，可能留下"只有 evidenceChain 没有 filesAnalysis"的不完整 JSON；finalize 时会重新写整个 v2 JSON，可自我修复。
6. **`BuildEvidenceInput.createdAt` 是测试专用字段**：生产代码不传，仅测试用。已在 JSDoc 标注。
7. **报告摘要长度 1800 chars 是经验值**：如果未来 LLM 上下文变紧或报告质量退化，可以调小到 1200 或调大到 3000。
8. **没有跑过"旧任务迁移"验证**：理论上 v2 JSON 兼容 `evidenceChain` 缺失，但**没有**真的在浏览器里打开一个 V1 之前创建的任务来确认 UI 不崩。建议人工验收第 5 项。
9. **没有推送远程**（按用户长期规则保持）。
10. **`docs/agent-reports/` 全部本地保留，不入库**（按用户长期规则）。

---

## 5. 需要人工验收的最小流程

按重要性排序：

### 必做

1. **新建任务 → 上传产物 → 自动分析**
   - 准备 ≥ 2 个模型
   - 一个模型上传 1 个产物（report.md / .pdf / .txt / .zip 均可）
   - 另一个模型不传任何产物
   - 确认：
     - 上传后立刻看到"分析中"徽标
     - 几十秒后变"已预分析"
     - 没传产物的模型按钮显示"请先上传产物"且 disabled

2. **证据链 UI**
   - 分析完成后，模型卡片里出现"证据链"折叠面板
   - 展开：按 主产物识别 / 文件清单 / 解析证据 / 结构检查 / 质量信号 / 后台候选证据 / 限制与风险 / 错误 顺序展示
   - 主产物识别与限制与风险默认展开
   - 顶部黄色提示条出现
   - 展开某条证据：能看到 title / summary / 来源 / 时间 / metadata；不出现"AI 内心思考""思维链"

3. **报告生成与产物效果反馈**
   - 不上传 tester_upload 截图 → 点击"生成评估报告"
   - 产物效果反馈应写"未上传产物效果截图，暂无法填写产物效果反馈。"
   - 交付效率 / 产物质量 / 综合评价应能引用证据摘要中的内容（主产物识别、质量信号等）
   - 轨迹分析在没传轨迹截图时写"未提供轨迹截图。"

4. **复制 MD**
   - 顶部"复制 MD"按钮
   - 粘贴到文本编辑器
   - 确认只含 5 模块正文（产物效果反馈 / 交付效率 / 产物质量 / 综合评价 / 轨迹分析）
   - 确认不含任务标题 / 任务描述 / 导出时间 / 评分概览表 / 验证说明 / 系统调试信息 / 原始 think

5. **失败路径**
   - 临时关闭 AI API 配置（或上传异常格式触发 4xx/5xx）
   - 模型卡片内出现**持久红色错误条**
   - 错误条右上角 × 可关闭，重新分析时自动清除
   - HTML 错误页被替换为短提示

### 可选

6. **错误条 × 关闭按钮**：点击后下次 `onRefresh`（1.5s 轮询）不会重新弹出，因为 run.error 已被清除（如果服务端仍 FAILED 会重新出现，这是 by-design）。

7. **多模型并发**：上传 2 个模型产物 → 各自独立状态，错误条独立。

8. **旧任务兼容**：打开一个本轮之前创建的任务 → `evidenceChain` 为 undefined，UI 显示占位"尚未生成证据链，请先分析产物。"

9. **历史自动截图**：打开 VerificationEvidencePanel，能看到历史 `backend_capture` / `sandbox_auto` / `legacy_auto` 截图被标记为"历史自动/捕获截图，已不计入官方产物效果截图"，且清除按钮可一键移除（不影响正式 evidenceChain）。

---

## 6. 回滚建议

### 6.1 推荐：分批回滚（按 4 个特性 commit）

回滚顺序（与提交顺序**反向**）：

1. **回滚 V1.1（证据链详情 UI + 解析硬化）**：
   ```bash
   git revert --no-commit 4a8e9c3 fe0ff18 d3b1c22 ead22ad f6ba3f0
   git commit -m "revert: V1.1 证据链详情 UI 与解析硬化"
   ```
   保留 V1 的自动 runner 与报告引用能力。

2. **回滚 V1（证据链 + auto runner + 报告引用）**：
   ```bash
   git revert --no-commit b4519a1 4c1a352 330cb33 6dae2a2 d3d6fa9
   git commit -m "revert: V1 证据链 + auto runner + 报告引用"
   ```

3. **回滚单模型 UX**：
   ```bash
   git revert --no-commit fe03119
   git commit -m "revert: 单模型产物分析状态与持久错误条"
   ```

4. **回滚复制 MD**：
   ```bash
   git revert --no-commit d92652f
   git commit -m "revert: 提交版导出"
   ```

### 6.2 紧急：全量回滚到 main

```bash
git checkout main
git branch -D test
git checkout -b test ede344b   # 从 main HEAD 重建 test
```

紧急情况下可直接走这条路；本分支 12 个 commit 全部可丢弃，main 状态不变。

### 6.3 单文件回滚

如果只想回滚某个文件到 main 版本：

```bash
git checkout ede344b -- src/path/to/file.ts
git commit -m "revert(file): 回滚 X 到 main 版本"
```

---

## 7. 合并 main 前检查项

| 项 | 状态 | 说明 |
|------|------|------|
| main 最近有没有变动？ | 需用户确认 | 用户告知未推远程，但合并前应 `git fetch` 检查 main |
| test 分支与 main 是否能 fast-forward 或 3-way merge？ | 预期是 | main 最近 commit `ede344b` 之后没有新提交 |
| 是否有冲突？ | 预期无 | test 仅修改了 `src/`、`docs/agent-reports/`；main 在同一时段无新改动 |
| `prisma` schema 是否变更？ | **否** | 整个 test 分支未动 `prisma/schema.prisma` |
| `package.json` 依赖是否变更？ | **否** | 未新增依赖 |
| 环境变量是否需要新增？ | **否** | 未新增任何 `.env` 字段 |
| 数据库迁移是否需要？ | **否** | 未改 schema，未新增表 / 字段 / 索引 |
| 既有 Vercel env 是否仍可用？ | 应是 | 代码逻辑未引入新 env 依赖 |
| 回滚演练是否准备好？ | 是 | 见第 6 节 |
| CHANGELOG / docs 是否更新？ | 已有 | `docs/agent-reports/` 3 份本地报告 + manual checklist |
| `pnpm test` 在 main 是否仍过？ | 应是 | 本轮改动不与 main 冲突 |

合并建议命令：

```bash
git checkout main
git pull            # 取最新 main
git merge --no-ff test
# 解决可能的冲突（预期无）
git push            # 仅在你明确同意后
```

或者 PR 流程：push test 分支 → 开 PR → reviewer 通过 → 合并。

---

## 8. 部署到 Vercel 前检查项

| 项 | 状态 | 说明 |
|------|------|------|
| Vercel 项目 Node 版本 | 检查 `.nvmrc` | 当前是 v22；本轮没动 Node 版本相关 |
| Vercel 环境变量 | 无新增 | 现有 `DATABASE_URL` / `DIRECT_URL` / `SESSION_PASSWORD` 等不需要改 |
| 数据库 schema 迁移 | **不需要** | 未改 schema，未新增字段；如果用户后续决定要落库 evidenceChain，需要单独迁移 |
| Next.js 构建命令 | `pnpm build` | 已验证通过 |
| Prisma generate | 在 `postinstall` 与 `build` 里 | 已正确生成 |
| Workflow runtime | 依赖 `@vercel/workflow` 或自建 | 本轮新增了 `'use step'` step `buildEvidence`；需要确认 Vercel workflow runtime 支持（仓库已有 `'use workflow'` 和 `'use step'` 在用） |
| 静态资源 / 上传限制 | 未变 | 没改上传文件大小 / 类型限制 |
| Edge runtime | 未触碰 | `route.ts` 仍为 `runtime = 'nodejs'` |
| 域 / Cookie / 跨域 | 未变 | 没改跨域 / Cookie 配置 |
| Cron / Scheduled | 无 | 没有新增定时任务 |
| Vercel 函数超时 | `maxDuration = 300` | generate-report route 已经设 300s；本轮新增 step 没改 |
| 数据库连接数 | 不变 | 没新增长连接 |
| Prisma 直连 vs pool | 不变 | 本轮不涉及 |

部署建议命令（用户执行）：

```bash
# 本地先 build 一遍
pnpm build

# 在 Vercel dashboard 里
# - 选择 test 分支
# - 点 Deploy
# - 监控构建日志

# 或者用 Vercel CLI
vercel --target=preview --branch=test
```

部署后立即做：

1. 打开 preview URL，新建任务 → 跑一遍第 5 节"需要人工验收的最小流程"
2. 检查 Vercel Functions 日志没有 `evidence_chain` 相关错误
3. 检查 workflow runs 没有 stuck

---

## 9. 已通过的自动验证

| 命令 | 结果 |
|------|------|
| `pnpm typecheck` | ✅ 通过（无错误输出） |
| `pnpm test` | ✅ **178 / 178 通过**（含 V1 + V1.1 新增共 21 个单测） |
| `pnpm build` | ✅ Next.js 生产构建成功，无 error/warning |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings（`no-explicit-any` 历史问题）；本轮新增/修改文件**未引入新 lint 错误** |

测试覆盖一览：

- `artifact-evidence-chain.test.ts` — 22 个（V1 11 + V1.1 11）
- `artifact-auto-runner.test.ts` — 10 个
- `analysis-error.test.ts` — 5 个
- `submission-markdown.test.ts` — 10 个
- 既有其它 lib 测试 — 131 个

---

## 10. 推荐合并顺序

如果决定合并：

1. 先把 test 分支的 12 个 commit **不要 squash**（保持独立可回滚）。
2. 合并策略：`merge --no-ff` 保留分支结构。
3. 在合并前**确认 main 在你这边没有新提交**——我无法远程验证，麻烦你确认。
4. 合并后立刻在 staging/preview 环境跑一遍第 5 节"必做"清单的 1-4 项。

---

报告完。