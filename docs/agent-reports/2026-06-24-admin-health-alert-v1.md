# Admin Health Alert Banner V1 — 完成报告

> 2026-06-24 test 分支单轮迭代。承接 health monitoring tab 之后做"主动找你"型预警。
> 不改 schema、不加运行时依赖、不合并 main、不推送远程。
> **报告本地保留，不入库。**

---

## 1. 本轮做了什么

| 任务 | 状态 | 摘要 |
|------|------|------|
| 1. 抽预警纯函数 | ✅ | `src/lib/health-alert.ts`：3 等级 + 浮点容差 + 暴露阈值常量 |
| 2. 单测 | ✅ | 16 个 `node:test`：null/空/各等级触发/兜底/边界/优先级 |
| 3. API 扩展 | ✅ | `?window=1h` 参数；与现有 range 共存 |
| 4. 轮询组件 | ✅ | `HealthAlertBanner`：60s 间隔 / 失败静默 / 用户可 dismiss |
| 5. 接入 admin | ✅ | 顶部横幅；仅 /admin 可见 |
| 6. 自动验证 | ✅ | `pnpm verify:release` PASSED in 38.1s（276/276 tests · typecheck · build） |

---

## 2. 新增 / 修改文件清单

### 新增 (3)

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/lib/health-alert.ts` | 109 | 纯函数 + 阈值常量 |
| `src/lib/health-alert.test.ts` | 159 | 16 个单测 |
| `src/components/admin/HealthAlertBanner.tsx` | 159 | 轮询 banner 组件 |

### 修改 (2)

| 文件 | 改动 |
|------|------|
| `src/app/api/admin/health/route.ts` | +4 / -1：支持 `?window=1h` |
| `src/app/admin/page.tsx` | +3 / 0：导入 + 顶部渲染 |

### `git diff --stat` (本轮)

```
 src/app/admin/page.tsx                     |   3 +
 src/app/api/admin/health/route.ts          |   6 +-
 src/components/admin/HealthAlertBanner.tsx | 159 +++++++++++ (新)
 src/lib/health-alert.test.ts               | 159 +++++++++++ (新)
 src/lib/health-alert.ts                    | 109 +++++++++ (新)
 5 files changed, 441 insertions(+), 2 deletions(-)
```

---

## 3. 设计要点

### 3.1 阈值设计

```
critical：1h 失败率 ≥ 50%  且  ≥ 10 次调用
warn：    1h 失败率 ≥ 20%        或  P95 > 60s
info：    1h 限流 (429) ≥ 3 次
正常：    上述都不满足 → null
```

**绝对值兜底的原因**：小流量项目（早期 / 低使用时段）一两次失败就会让"百分比"看起来很糟。10 次兜底避免误报；3 次限流兜底区分"偶发抖动"与"持续限流"。

### 3.2 浮点容差坑（重点）

```ts
// 1 - 0.8 === 0.19999999999999996
// 0.1999... >= 0.2 === false  ← 边界测试失败！
```

发现这个坑是因为一个单测预期"20% 失败率返回 warn"但实际返回 null。

修法：threshold 比较用 `geWithTolerance(a, b)` 内部 `a >= b - 1e-9`。`1e-9` 比常见 LLM 算百分比四舍五入误差（最多 ~0.5%）小 5 个数量级，**不会**误报其它情况。

### 3.3 三个等级用相同摘要结构

`assessHealthAlertLevel` 接受 `AssessableSummary` 接口，**只取 `totals` 和 `failures[].category`** 两个字段。buildHealthSummary 输出的 HealthSummary 自动满足，**无需做新的查询 / 聚合**。这意味着：

- 0 重复代码
- 0 重复计算
- 0 重复 IO

### 3.4 轮询策略

- **首次延迟 5s**：避免冷启动争用；用户进入 admin 后 5s 才第一次拉取。
- **之后 60s 一次**：与人类感知"异常"的合理频率匹配（再快就是噪音）。
- **失败静默**：fetch 失败 / 401 / 500 → 清空 alert，不显示过期数据。这与"沉默即安全"原则一致。
- **dismiss 行为**：用户 X 关闭后到下次轮询前不出现；但每次新轮询结果会重置 dismiss（因为新结果可能更严重）。

### 3.5 视觉选择

| 等级 | 颜色 | 触发感 |
|------|------|--------|
| critical | red-500/15 背景 + red 边框 + 红 badge | 立即关注 |
| warn | amber-500/15 背景 + 琥珀 | 留意 |
| info | white/[0.04] 背景 + 灰 | 知会 |

**没选**绿色"all good"banner——怕视觉上"长期常绿" → 出现一次红色变成"上次崩了"心理负担。

### 3.6 仅 admin 看到

放在 admin/page.tsx 顶部而非全局 layout：admin 进入 `/admin` 是日常运维动作，dashboard / settings 等页面不该被运维预警打扰。同时也避免普通用户误点"查看"看到 403。

---

## 4. 测试覆盖

### 4.1 health-alert.test.ts（16 个新增）

| 分组 | 测试数 | 重点 |
|------|--------|------|
| null/空数据 | 2 | null 输入 / aiCallsTotal=0 |
| 全成功 | 1 | 应返回 null |
| critical | 3 | 高失败率 / 兜底（<10 次不报）/ 60% |
| warn | 3 | 30% 失败率 / P95=90s / P95=50s 不报 |
| info | 2 | 限流 5 次 / 限流 2 次不报 |
| 优先级 | 2 | critical > P95 warn / warn 失败率 > info 限流 |
| 边界 | 2 | 50%/20% 含端点 |
| 阈值导出 | 1 | HEALTH_ALERT_THRESHOLDS 字段稳定 |

### 4.2 完整统计

| 状态 | 测试文件 | 测试数 |
|------|---------|--------|
| 既有 | 各 `*.test.ts` | 260 |
| 本轮新增 | `health-alert.test.ts` | 16 |
| **总计** | **6 个 suites** | **276 / 276 通过** |

---

## 5. 人工验收清单

按重要性排序：

### 必做

1. **以 admin 身份进入 /admin** → 5 秒后顶部出现横幅（如果当前 1h 内有预警）
2. **当前无异常** → 横幅不显示（不刷错）
3. **3 等级视觉**：人工触发 1h 内 50%+ 失败 / 20%+ 失败 / ≥3 次 429，分别看到红/黄/灰横幅
4. **X 关闭** → 横幅消失；60s 内不出现
5. **"查看"链接** → 跳到 /admin（如果在其它 tab 也会跳到顶部）
6. **非 admin 用户** 访问 /admin → 被 layout 拦截，看不到横幅（layout 已 requireAdmin）

### 失败路径

7. **API 暂时不可用** → 横幅不显示（静默），不影响其它 UI
8. **AuditLog 1h 窗口为空** → 横幅不显示（assessHealthAlertLevel 早返回 null）

### 可选

9. **临界状态切换**：手动插入 9 次失败（< 10 兜底）→ 看不到 critical
10. **轮询间隔验证**：devtools network 看 `/api/admin/health?window=1h` 每 60s 一次

---

## 6. 自动验证结果

| 命令 | 结果 |
|------|------|
| `pnpm verify:release` | ✅ **PASSED in 38.1s** |
| └ `pnpm test` | ✅ 276 / 276 |
| └ `pnpm typecheck` | ✅ 0 errors |
| └ `pnpm build` | ✅ 生产构建成功 |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings；本轮**未引入新 lint 错误** |

---

## 7. test 分支 commit 增量（自 main HEAD 起的最近 4 轮）

| Hash | Message |
|------|---------|
| `83d4875` | `feat(admin): 1h health alert banner on admin page (poll 60s)`（本轮） |
| `201381f` | `feat(admin): health monitoring tab` |
| `c817fc6` | `feat(a11y): focus trap for KeyboardShortcutsButton overlay` |
| `5dac040` | `feat(a11y): SkipLink + KeyboardShortcutsButton + 详情页 j/k/gd 快捷键` |

工作树：
```
## test
?? docs/agent-reports/
```

---

## 8. 风险点与遗留

1. **阈值是经验值**：critical 50% / warn 20% / 10 次兜底 / 3 次限流。**生产观察几周后**如果发现"误报"或"漏报"再调。`HEALTH_ALERT_THRESHOLDS` 暴露常量，调起来不必改函数。
2. **没做通知触达**：现在只在 admin 进入页面时被动看到。**没有**邮件 / webhook / Slack 通知。如果想"凌晨 3 点崩了也要发现"，需要接通知（要新增依赖 / Vercel cron）。
3. **轮询只查 1h 窗口**：每次请求查 AuditLog 1h 范围。**性能**：1h 窗口 + AI_* 过滤后数据量很小（即使 1k calls 也很轻），不影响。
4. **没有跑端到端 UI**（按用户排期跳过）。
5. **admin layout 已 requireAdmin**：所以横幅只在 admin 看到，无额外权限校验开销。

---

## 9. 本轮在长期规则边界上的处理

- 仍在 `test` 分支工作 ✅
- 未合并 main，未推送远程 ✅
- 未改 Prisma schema ✅
- 未新增运行时依赖 ✅
- 未接入 Vercel Sandbox / 自动截图 runner ✅
- 报告未涉及 tester_upload / 截图来源 ✅
- 未改报告生成 prompt 或分析轨迹脱敏 ✅
- 报告本地保留 ✅

---

## 10. 下一轮建议

按之前对齐的优先级 A → C → D → B 顺序，本轮 A 已完成。下一轮建议 **C：组件级测试基础设施**。

### C. 组件级测试基础设施（半天）

**思路**：引入 `@testing-library/react` + `jsdom`（dev-only），覆盖核心组件渲染契约。

**优先覆盖**：
- `<SkipLink />`（a11y 跳转）
- `<KeyboardShortcutsButton />`（open/close + ? key 触发）
- `<useFocusTrap />` hook（tab/esc 行为）
- `<HealthAlertBanner />`（3 等级渲染）
- `<StepSidebar />`（当前/已完成/未来步骤状态）

**次级**：
- `<ConfirmDialog />` —— 同时顺手做"重构为 useFocusTrap"（前两轮遗留），RTL 验证行为等价
- `<ArtifactEvidenceChainPanel />`（V1.1 一直没测）

**不覆盖**（避免维护爆炸）：
- 整个 tasks/[id]/page.tsx 容器层（30+ state）
- dashboard 整个 page.tsx

**风险**：中。RTL 配置 + jsdom + Next.js 三方配合可能有怪味（async server components、route handler 不会跑）。预计需要 ~1 小时踩坑。

**理由**：本轮新增的 3 个组件（SkipLink / KeyboardShortcutsButton / HealthAlertBanner）+ useFocusTrap + StepSidebar 都很"契约稳定"，是 RTL 最高 ROI 的标的。一轮做完，**未来重构 UI 不用"心里没底"**。

回"开干"即可推进。如果你想换方向（比如先 D：health V2 加按 model 维度聚合），告诉我。

---

报告完。
