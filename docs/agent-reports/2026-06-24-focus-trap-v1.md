# Focus Trap V1 — 完成报告

> 2026-06-24 test 分支单轮迭代。承接 a11y-and-shortcuts-v2 之后的焦点管理收尾。
> 不改 schema、不加依赖、不合并 main、不推送远程。
> **报告本地保留，不入库。**

---

## 1. 本轮做了什么

| 任务 | 状态 | 摘要 |
|------|------|------|
| 1. 抽出 `useFocusTrap` hook | ✅ | React 生命周期编排：trigger 记录 / initialFocus / scrollLock / Tab 循环 / 还原焦点 |
| 2. 抽出纯 helpers `focus-trap.ts` | ✅ | `filterFocusable` / `getNextFocusTarget` / `FOCUSABLE_SELECTOR`；duck-typing 在 Node 可单测 |
| 3. KeyboardShortcutsButton 接入 trap | ✅ | 浮层 panel + 关闭按钮作为 initialFocus；body scroll lock；返回焦点到 Keyboard 触发按钮 |
| 4. helpers 单测 | ✅ | 13 个 `node:test` 覆盖 disabled / aria-hidden / 正反向 Tab / 边界 |
| 5. 自动验证 | ✅ | 219/219 tests · 0 typecheck errors · build success |

---

## 2. 新增 / 修改文件清单

| 文件 | 行数 | 状态 |
|------|------|------|
| `src/lib/focus-trap.ts` | 77 | 新增（纯 helpers） |
| `src/lib/focus-trap.test.ts` | 117 | 新增（13 单测） |
| `src/components/ui/useFocusTrap.ts` | 113 | 新增（hook） |
| `src/components/ui/KeyboardShortcutsButton.tsx` | +12 / -2 | 修改（接入 hook） |

`git diff --stat` 自上一轮 commit `5dac040`：
```
 src/components/ui/KeyboardShortcutsButton.tsx |  14 +++-
 src/components/ui/useFocusTrap.ts             | 113 +++++++++++++++++++++++++ (新)
 src/lib/focus-trap.test.ts                    | 117 ++++++++++++++++++++++++++ (新)
 src/lib/focus-trap.ts                         |  77 ++++++++++++++++++ (新)
 4 files changed, 313 insertions(+), 2 deletions(-)
```

---

## 3. 设计要点

### 3.1 为什么 helpers 与 hook 分两个文件

- `src/lib/focus-trap.ts`：纯函数，无 React 依赖，duck-typed 接口（`FocusableLike`），可被 `tsx --test src/lib/*.test.ts` 直接覆盖
- `src/components/ui/useFocusTrap.ts`：React hook，负责生命周期、ref、DOM 副作用
- 同样的分层思路与上一轮 `keyboard-shortcuts.ts` 一致：**逻辑可测，编排不测**

### 3.2 `filterFocusable` 的过滤规则

```ts
- el.disabled === true              → 排除（disabled button 不应被 Tab 到）
- el.closest('[aria-hidden="true"]')→ 排除（屏幕阅读器视为不存在的子树）
- 其它                              → 保留
```

明确**不过滤**：`tabindex="-1"`（由 CSS selector 层已排除）、`type="hidden"`、CSS `display:none`。后两者由浏览器的 `:focus-visible` 行为自然兜底，且检测它们需要 `getComputedStyle`，成本不值得。

### 3.3 `getNextFocusTarget` 的"返回 null 表示不拦截"约定

```ts
return null   // → useFocusTrap 不调 e.preventDefault()，浏览器自然处理 Tab
return target // → useFocusTrap 调 preventDefault + target.focus()
```

只在**真正需要循环回去**时才返回 target，中间位置的 Tab 让浏览器自己走。这避免了一个常见 trap bug："Tab 从 A → B 时被 hook 强制 focus 到 A"。

### 3.4 trigger 还原的"DOM 仍在树中"保护

```ts
const trigger = triggerRef.current
if (trigger && document.contains(trigger)) {
  trigger.focus()
}
```

打开浮层 → 在浮层内删除一个列表项 → 关闭浮层 → 还原焦点到已卸载的元素。`document.contains` 保护避免 `focus()` 调到 detached node 造成滚动跳动。

### 3.5 为什么 ConfirmDialog 暂不重构

ConfirmDialog 已有内嵌完整 trap（line 67-88），契约稳定、被多处使用。强行换成 hook：
- 短期：变更面广、回归风险高
- 收益：仅是代码 DRY，行为零变化
- 取舍：先让 hook 在新场景（KeyboardShortcutsButton）跑稳，再下一轮做"统一收敛"

下一轮如果做"组件级测试基础设施"，正好顺手用 RTL 验证 ConfirmDialog 重构后行为等价，再替换。

---

## 4. 测试覆盖

### 4.1 focus-trap.test.ts（13 个新增）

| # | 测试 | 断言点 |
|---|------|--------|
| 1 | FOCUSABLE_SELECTOR 字符串结构稳定 | 防止误删 button/input/select/textarea/href/tabindex |
| 2 | filterFocusable: disabled 被过滤 | 三元素中间一个 disabled |
| 3 | filterFocusable: aria-hidden 容器内被过滤 | closest 命中 |
| 4 | filterFocusable: 没有 closest 方法不抛错 | 防御 |
| 5 | filterFocusable: 空数组 → 空 | 边界 |
| 6 | getNextFocusTarget: 空列表 → null | 不拦截契约 |
| 7 | 正向 Tab @ 最后一个 → 第一个 | 循环 |
| 8 | 正向 Tab @ 中间 → null | 让浏览器走 |
| 9 | 正向 Tab @ 容器外 → 第一个 | 侵入兜底 |
| 10 | 反向 Tab @ 第一个 → 最后一个 | 循环 |
| 11 | 反向 Tab @ 中间 → null | 让浏览器走 |
| 12 | 反向 Tab @ current=null → 最后一个 | 边界（容器外起步） |
| 13 | 单元素列表，Tab/Shift+Tab 都返回自己 | 边界 |

### 4.2 完整统计

| 状态 | 测试文件 | 测试数 |
|------|---------|--------|
| 既有 | 各 `*.test.ts` | 206 |
| 本轮新增 | `focus-trap.test.ts` | 13 |
| **总计** | **6 个 suites** | **219 / 219 通过** |

---

## 5. 人工验收清单

按重要性排序：

### 必做

1. **键盘快捷键浮层 Tab 循环**：
   - 任意页面按 `?` → 浮层弹出，焦点落在 X 关闭按钮
   - 反复按 `Tab` → 焦点在 panel 内可聚焦元素之间循环（不会逃到外层 Topbar/正文）
   - 反复按 `Shift+Tab` → 反向循环
   - 按 `Esc` → 浮层关闭，焦点回到 `?` 触发按钮（顶栏 Keyboard 图标按钮）
2. **body scroll lock**：浮层打开时滚轮滚不动正文（背景 backdrop 已锁）
3. **多次开关**：连续按 `?` 6 次 → 视觉/焦点表现稳定，不卡死
4. **多浮层级联**（详情页）：浮层打开时，按 `j` 不应该切 step（输入焦点已被 trap 接管，但 `j` 没绑在 input 上，应该仍生效）；如果不希望切换，需要后续轮 — 留作"已知行为"

### 可选

5. **触发于不同初始焦点状态**：先点输入框 → 按 `?` → 焦点应该跳到关闭按钮（不被 input 占住）
6. **关闭时 trigger 被删除**：理论上 trap 应安全 no-op（document.contains 守卫）；本轮无实际场景，先标已知

---

## 6. 自动验证结果

| 命令 | 结果 |
|------|------|
| `pnpm test` | ✅ **219 / 219 通过**（206 + 新增 13） |
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 生产构建成功 |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings；本轮**未引入新 lint 错误** |

---

## 7. test 分支 commit 增量

| Hash | Message |
|------|---------|
| `c817fc6` | `feat(a11y): focus trap for KeyboardShortcutsButton overlay` |
| `5dac040` | `feat(a11y): SkipLink + KeyboardShortcutsButton + 详情页 j/k/gd 快捷键`（上一轮） |

工作树：
```
## test
?? docs/agent-reports/
```

---

## 8. 风险点与遗留

1. **ConfirmDialog 未重构为 hook**：契约层等价，但代码仍是两份 trap 实现。建议下一轮"组件级测试基础设施"轮统一。
2. **trap 不处理 Escape**：按约定 Esc 由调用方处理；KeyboardShortcutsButton 已在自己的 keydown handler 里关闭浮层，行为与重构前一致。
3. **`initialFocusDelay = 20ms` 经验值**：与 `animate-rise` 240ms 动画并不严格对齐，但 20ms 足以让 React 完成挂载后再 focus，避免 focus 还未到 DOM 上。如果未来发现"按 ? 后第一次 Tab 失灵"，可调到 50ms。
4. **`pnpm test` glob 仍是 `src/lib/*.test.ts`**：本轮把 helpers 放到 lib 是为绕开这个限制。如果未来要给 hook 本身（生命周期）写组件级测试，仍需扩展 glob 或引入 jsdom + RTL。
5. **没有跑端到端 UI**（按用户排期跳过）。

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

接下来按之前对齐的优先级，**进入 ⑤ 可观测性看板**：

- admin 后台新增"系统健康"页
- 数据源：AuditLog + TaskModel.artifactAnalysisJson 已有字段聚合
- 不新增表、不新增 Prisma 字段
- 范围：最近 24h 报告生成成功率 / 平均耗时 / 失败原因 top 5 / AI 配置健康度

预计工作量 1 天，可分两个 commit：
1. API 聚合路由 `/api/admin/health` + 纯函数 aggregator + 单测
2. admin 页面消费 + 视觉

如果你认可，下一轮直接开干。如果有别的优先（比如"先打开 dev server 跑一遍 e2e 验证最近三轮的体验改动"），告诉我。

---

报告完。
