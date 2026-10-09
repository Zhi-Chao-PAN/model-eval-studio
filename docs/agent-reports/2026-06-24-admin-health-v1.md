# Admin Health Monitoring V1 — 完成报告

> 2026-06-24 test 分支单轮迭代。管理后台新增「健康监控」tab，做现有 audit tab 缺失的可观测性视角。
> 不改 schema、不加运行时依赖、不合并 main、不推送远程。
> **报告本地保留，不入库。**

---

## 1. 本轮做了什么

| 任务 | 状态 | 摘要 |
|------|------|------|
| 1. 现状侦察 | ✅ | 发现 AuditLog 已收集 durationMs/token/error/status；admin 已有 audit tab 含基础统计——避免重复设计 |
| 2. 抽 aggregator 纯函数 | ✅ | `src/lib/admin-health.ts` ~400 行，零 React 依赖 |
| 3. 单测 | ✅ | 41 个 `node:test`，覆盖错误分类 / percentile / 5 个聚合视角 / 入口 |
| 4. API 路由 | ✅ | `/api/admin/health`，仅 admin / 速率限制 / range 切换 |
| 5. UI 组件 | ✅ | 独立文件 `AdminHealthTab.tsx`，避免 admin/page.tsx 撑爆 |
| 6. 接入 admin 页面 | ✅ | TabKey 扩展 + 顶部 tab 按钮 + 渲染调用，admin/page.tsx 仅改 3 处 |
| 7. 自动验证 | ✅ | `pnpm verify:release` PASSED in 43.4s（260/260 tests · typecheck · build） |

---

## 2. 新增 / 修改文件清单

### 新增 (4)

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/lib/admin-health.ts` | 407 | 纯 aggregator：5 视角 + buildHealthSummary 入口 |
| `src/lib/admin-health.test.ts` | 332 | 41 个单测 |
| `src/app/api/admin/health/route.ts` | 91 | API 路由，仅 admin |
| `src/components/admin/AdminHealthTab.tsx` | 331 | 完整 tab UI |

### 修改 (1)

| 文件 | 改动 |
|------|------|
| `src/app/admin/page.tsx` | TabKey 扩展 / Gauge 导入 / 第 4 个 tab 按钮 / 渲染分支，共 +14 行 |

### `git diff --stat` (本轮)

```
 src/app/admin/page.tsx                  |  14 +-
 src/app/api/admin/health/route.ts       |  91 ++++ (新)
 src/components/admin/AdminHealthTab.tsx | 331 +++++++++++ (新)
 src/lib/admin-health.test.ts            | 332 +++++++++++ (新)
 src/lib/admin-health.ts                 | 407 +++++++++++++ (新)
 5 files changed, 1501 insertions(+), 2 deletions(-)
```

---

## 3. 设计要点

### 3.1 为什么不新建独立页面 `/admin/health`

提案阶段差点踩坑。侦察发现 admin 已有 audit tab，包含「总调用 / Token / 失败率 / 活跃用户」4 个 score-tile + 时间范围切换 + 多维筛选 + 详情展开。
强行做独立页面会和现有 audit tab 严重重复——违反「拒绝重复工作」长期规则。

最终方案：**在 admin 现有 tab 旁加第 4 个 tab，专做 audit tab 缺失的 5 个视角**。

| 视角 | audit tab 是否有 | health tab 提供 |
|------|------------------|------------------|
| 总调用 / Token / 失败率 | ✅ | ❌（不重复） |
| 详细日志列表 | ✅ | ❌（不重复） |
| **AI 成功率（带颜色阈值）** | ❌ | ✅ |
| **平均 / P95 / P99 耗时** | ❌ | ✅ |
| **按 action 分组的成功率与耗时** | ❌ | ✅ |
| **失败原因白名单分类** | ❌ | ✅ |
| **延迟分布直方** | ❌ | ✅ |
| **24h 趋势条** | ❌ | ✅ |
| **用户 AI 调用排行** | ❌ | ✅ |

### 3.2 失败分类白名单：8 类 + 优先级敏感

错误信息是自由文本。按经验工程归类：

```ts
顺序敏感（先匹配的胜出）：
  timeout      → /timeout|timed out|esockettimedout|deadline exceeded/
  rate_limit   → /429|rate.?limit|too many requests/
  auth         → /\b401\b|\b403\b|unauthor|forbidden|invalid api key/
  server_error → /\b5\d{2}\b|internal server error|bad gateway|.../
  token_limit  → /token.{0,20}(limit|exceed|max)|context.{0,5}length|.../
  json_parse   → /json.{0,10}(parse|syntax)|unexpected token|.../
  network      → /econnrefused|enotfound|fetch failed|.../
  cancelled    → /cancel|abort/
  其它         → other
```

准确度估计 70-80%（单测里有"timeout 与 429 同时出现 → 归 timeout"这种优先级反例）。
未来若要 100% 准确，需要在错误源头加 `errorCode` 字段（需改 schema，本轮不做）。

### 3.3 5 个视角对应的 5 个 aggregator

| 视角 | 函数 | 输出 |
|------|------|------|
| 按 action | `summarizeByAction` | `ByActionSummary[]`，按 total 降序 |
| 失败分类 | `summarizeFailures` | `FailureCategorySummary[]`，按 count 降序，最多 3 个样本 |
| 延迟分布 | `summarizeLatencyDistribution` | 5 固定桶（<1s / 1-3s / 3-10s / 10-30s / ≥30s） |
| 24h 趋势 | `summarizeHourlyTrend` | 按整点对齐，每桶 total/success/failed |
| 用户排行 | `summarizeUserRanking` | top N，userId=null 归 anonymous |

入口 `buildHealthSummary` 一次性产出全部 5 个视角 + 顶部 totals（含 p95/p99）。

### 3.4 UI 不引入 chart 库

5 个视角的可视化全部用 pure CSS bar 实现：
- 24h 趋势：`flex` + `height: %` + 失败部分红色叠在 totals 顶
- 成功率：嵌入式进度条，按阈值动态染色（≥95% 绿、≥85% 黄、<85% 红）
- 失败分类 / 延迟分布：水平条，按桶位染色

避免新增依赖。视觉与现有 score-tile / panel 风格一致。

### 3.5 API 数据量考虑

`AuditLog` 表可能很大。本路由的查询带两个 where 条件：

```ts
where: {
  createdAt: { gte: from, lte: to },  // 时间窗口
  action: { in: AI_ACTIONS },          // 5 个枚举值
}
```

`createdAt` 应该有索引（标准 Prisma 默认），结合枚举过滤可走索引扫描。最坏情况是 30d × 全部 AI 调用——但项目当前规模这个查询应仍很快。若未来数据膨胀，可加 cron snapshot 表（违反"不改 schema"约束，本轮不做）。

---

## 4. 测试覆盖

### 4.1 admin-health.test.ts（41 个新增）

| 分组 | 测试数 | 重点 |
|------|--------|------|
| `categorizeError` | 11 | 8 类匹配 + 优先级反例 + 空输入 + 完全无规律 |
| `percentile` | 6 | 空 / 单元素 / 0% / 100% / 50% / p95 / 乱序 |
| `isAiAction` | 1 | AI_ 前缀检测 |
| `summarizeByAction` | 4 | 非 AI 过滤 / 综合统计 / 排序 / 缺 token 字段 |
| `summarizeFailures` | 4 | 仅 error 状态 / 排序 / 最多 3 样本 / 截断 |
| `summarizeLatencyDistribution` | 4 | 5 桶存在 / 边界值 / null 忽略 / 非 AI 忽略 |
| `summarizeHourlyTrend` | 4 | from>=to / 桶数 / 落桶 / 范围外忽略 |
| `summarizeUserRanking` | 5 | 排序 / 限条数 / 匿名归并 / token 累计 / 失败率 |
| `buildHealthSummary` | 2 | 空记录零值结构 / 综合统计 |

### 4.2 完整统计

| 状态 | 测试文件 | 测试数 |
|------|---------|--------|
| 既有 | 各 `*.test.ts` | 219 |
| 本轮新增 | `admin-health.test.ts` | 41 |
| **总计** | **6 个 suites** | **260 / 260 通过** |

---

## 5. 人工验收清单

按重要性排序：

### 必做

1. **以 admin 身份登录** → 进入 `/admin` → 顶部 tabs 出现第 4 个「健康监控」（Gauge 图标）
2. **点开健康监控**：
   - 加载状态 → 数据呈现
   - 顶部 4 个 score-tile：AI 成功率、平均耗时、P95、P99
   - 成功率 tile 颜色随阈值变化：≥95% 绿 / ≥85% 黄 / <85% 红
3. **趋势条**：
   - 24 个柱（近 24h）/ 7 天用 `7d` 切到 168 个柱
   - 鼠标悬停看 tooltip：「6/24 10:00 · 共 N 次（失败 M）」
   - 失败部分用红色叠在柱顶
4. **按操作类型表格**：
   - 每行：操作中文名 + 总数 + 成功率进度条 + 平均/P95 耗时 + 平均 Token
   - 默认按 total 降序
5. **失败原因分类**：
   - 无失败时显示绿色 "✓ 时间窗内无失败记录"
   - 有失败时分类水平条，可展开「查看样本」看 3 条原文
6. **延迟分布**：5 个固定桶水平条，前两桶（<1s / 1-3s）绿色，第 3 桶紫色，第 4 桶橙色，第 5 桶红色
7. **用户排行**：top 10，每行 #编号 + 头像 + 用户名 + 总调用 + 成功率进度条 + 累计 Token
8. **切换 range**：today/7d/30d，数据重新加载；窗口时间显示在 range 切换器右侧

### 失败路径

9. **非 admin 用户访问** `/api/admin/health` → 403
10. **AuditLog 全空时**：tab 加载完成，显示「无 AI 调用记录」「无失败」等占位语，不崩

### 可选

11. **速率限制**：连续刷新 30 次后第 31 次返回 429
12. **AI 调用都失败**的极端样本：成功率显示 0%、红色色调、失败分类满

---

## 6. 自动验证结果

| 命令 | 结果 |
|------|------|
| `pnpm verify:release` | ✅ **PASSED in 43.4s** |
| └ `pnpm test` | ✅ 260 / 260 |
| └ `pnpm typecheck` | ✅ 0 errors |
| └ `pnpm build` | ✅ 生产构建成功 |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings；本轮**未引入新 lint 错误** |

---

## 7. test 分支 commit 增量（自 main HEAD `dcea05d` 起的本轮 + 前两轮）

| Hash | Message |
|------|---------|
| `201381f` | `feat(admin): health monitoring tab — by-action / failures / latency / trend / user ranking`（本轮） |
| `c817fc6` | `feat(a11y): focus trap for KeyboardShortcutsButton overlay` |
| `5dac040` | `feat(a11y): SkipLink + KeyboardShortcutsButton + 详情页 j/k/gd 快捷键` |

工作树：
```
## test
?? docs/agent-reports/
```

---

## 8. 风险点与遗留

1. **错误分类是经验工程**：白名单覆盖 70-80% 常见错误；新错误样本归 `other`。如果以后某类未分类错误频繁出现，应回来在 `categorizeError` 里加一条规则（或长期看在错误源头加 errorCode 字段，需要改 schema）。
2. **趋势条没有 X 轴标签**：24 个柱只能靠 tooltip 看时间。本轮没加 X 轴是为了避免视觉拥挤；如有需要可后续添加每 6 小时一个 label。
3. **7d / 30d 趋势条柱数较多**：30d × 24 = 720 个柱，水平滚动条会出现。如果觉得难看，可降级到「按天聚合」（aggregator 已有结构基础，只需新加一个函数）。
4. **没有按 model 维度聚合**：每个用户配的 AI 模型不同，理论上"哪个 baseUrl/modelName 失败率高"也是有价值视角。但 model 信息在 `AuditLog.detail`（JSON）里，需要额外解析。本轮先不做。
5. **AuditLog 索引未验证**：本轮的查询 `where createdAt+action` 假设 createdAt 有索引（Prisma 默认）。如果数据膨胀到 100k+ 条，应做 EXPLAIN 看看。
6. **没有跑端到端 UI**（按用户排期跳过）。

---

## 9. 本轮在长期规则边界上的处理

- 仍在 `test` 分支工作 ✅
- 未合并 main，未推送远程 ✅
- 未改 Prisma schema ✅
- 未新增运行时依赖 ✅（仅新增内部模块，无 package.json 变化）
- 未接入 Vercel Sandbox / 自动截图 runner ✅
- 报告未涉及 tester_upload / 截图来源 ✅
- 未改报告生成 prompt 或分析轨迹脱敏 ✅
- 报告本地保留 ✅

---

## 10. 下一轮建议

按之前对齐的优先级，下一阶段可走方向（按推荐度）：

### A. 复用 health 数据到 dashboard / 加预警（半天）
- admin 顶部的 actionMsg 区，如果检测到"近 1h 失败率 > 30%"或"p95 > 60s"，弹一条红色 banner
- 不需要新页面，只在 page.tsx 顶部加一个轮询小钩子

### B. lint 历史 205 errors 系统清理（1-2 天）
- 之前推迟项，纯重构。可作为"任意空档"轮做。

### C. 组件级测试基础设施（半天）
- 引入 `@testing-library/react` + `jsdom`，覆盖 SkipLink / KeyboardShortcutsButton / AdminHealthTab 等核心组件渲染契约
- 顺便用 RTL 验证 ConfirmDialog 重构为 useFocusTrap 后行为等价（前两轮的遗留）

### D. health 视角 V2（半天）
- 按 model 维度聚合（解析 AuditLog.detail.modelName）
- 按 baseUrl 分组（看哪个上游不稳定）
- 7d/30d 切换为按天聚合避免过密

我个人倾向 **A → C → D → B** 顺序：A 立刻产生价值（admin 不用主动开页面也能看到异常）；C 是基础设施投资；D 是 health 的自然延续；B 留作低优先级体力活。

如果你同意 A，回"开干"即可；如果想换顺序或砍掉某项，告诉我。

---

报告完。
