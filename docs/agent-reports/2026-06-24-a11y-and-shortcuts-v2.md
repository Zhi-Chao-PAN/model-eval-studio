# A11y & Keyboard Shortcuts V2 — 完成报告

> 2026-06-24 test 分支单轮迭代。本轮聚焦"无障碍 + 键盘可达性"的统一化、组件化与扩展。
> 不动 Prisma schema、不加运行时依赖、不合并 main、不推送远程。
> **报告本地保留，不入库。**

---

## 1. 本轮做了什么

| 任务 | 状态 | 摘要 |
|------|------|------|
| 1. 抽取 `<SkipLink>` 共享组件 | ✅ | 一行调用替换 4 个 layout 各自硬编码的 9 行 className |
| 2. 补齐 skip-link 缺口 | ✅ | share / 首页 page.tsx 首次接入；login/register 主动跳过（见 §5） |
| 3. 抽取 `<KeyboardShortcutsButton>` 共享组件 | ✅ | 接受 `shortcuts[]`，自托管 `?` / `Esc` 开关 |
| 4. 抽取键盘 helper `keyboard-shortcuts.ts` | ✅ | 4 个纯函数：`isTypingTarget` / `matchShortcut` / `nextStepKey` / `consumeGPrefix` |
| 5. dashboard 改用共享组件 | ✅ | 删除 60+ 行内嵌实现，handler 用 `isTypingTarget` 收敛 3 处重复判断 |
| 6. 详情页接入快捷键 | ✅ | j/k 切 step、g d 回 dashboard、g s 进设置；顶栏 `?` 浮层入口 |
| 7. 新增单测 | ✅ | 16 个 helper 单测；覆盖打字 target / 修饰键 / 边界 / g 前缀 / 大小写归一 |
| 8. 自动验证 | ✅ | 206/206 tests · 0 typecheck errors · build success |

---

## 2. 新增 / 修改文件清单

### 新增 (4)

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/lib/keyboard-shortcuts.ts` | 88 | 纯 helper，零 React 依赖，duck-typing 让 Node 单测可直接覆盖 |
| `src/lib/keyboard-shortcuts.test.ts` | 127 | 16 个 `node:test` 断言 |
| `src/components/ui/SkipLink.tsx` | 32 | `'use client'` 非必需，可作为 Server Component 渲染 |
| `src/components/ui/KeyboardShortcutsButton.tsx` | 110 | `'use client'`，自管 open state + `?` / `Esc` |

### 修改 (8)

| 文件 | 改动 |
|------|------|
| `src/app/admin/layout.tsx` | 9 行硬编码 skip-link → `<SkipLink />` |
| `src/app/dashboard/layout.tsx` | 同上 |
| `src/app/settings/layout.tsx` | 同上 |
| `src/app/tasks/[id]/layout.tsx` | 同上 |
| `src/app/share/[token]/layout.tsx` | 首次接入 skip-link |
| `src/app/page.tsx` | 首次接入 skip-link，main 元素加 `id="main-content"` |
| `src/app/dashboard/page.tsx` | 删 60+ 行内嵌 shortcuts UI 与 ? handler；改用共享组件；`isTypingTarget` 收敛 |
| `src/app/tasks/[id]/page.tsx` | 新增 useEffect 监听 j/k/gd/gs；顶栏挂 `<KeyboardShortcutsButton>` |

### `git diff --stat`

```
 src/app/admin/layout.tsx                       |  8 +---
 src/app/dashboard/layout.tsx                   |  8 +---
 src/app/dashboard/page.tsx                     | 93 +++++++++++-----------------
 src/app/page.tsx                               |  4 +-
 src/app/settings/layout.tsx                    |  8 +---
 src/app/share/[token]/layout.tsx               |  4 +-
 src/app/tasks/[id]/layout.tsx                  |  8 +---
 src/app/tasks/[id]/page.tsx                    | 65 ++++++++++++++++++++++++
 src/components/ui/KeyboardShortcutsButton.tsx  | 110 ++++++++++++++++++++++ (新)
 src/components/ui/SkipLink.tsx                 |  32 ++++++++ (新)
 src/lib/keyboard-shortcuts.test.ts             | 127 ++++++++++++++++++++++++ (新)
 src/lib/keyboard-shortcuts.ts                  |  88 ++++++++++++++++++++ (新)
 12 files changed, 483 insertions(+), 95 deletions(-)
```

---

## 3. 设计要点

### 3.1 `<SkipLink>` 为什么不需要 `'use client'`

无 hook、无事件、纯 JSX。可以作为 Server Component 直接渲染在 async layout 里，避免引入不必要的 client boundary。`focus:` 视觉切换由 Tailwind 在 CSS 层处理，不需要 JS 参与。

### 3.2 `keyboard-shortcuts.ts` 为什么用 duck-typing 而非 `instanceof Element`

```ts
// 旧（dashboard 内嵌的写法）
if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
if (active && active.isContentEditable) return
```

dashboard 内嵌版本依赖 `HTMLElement` 全局——Node 测试环境下 `HTMLElement` 不存在，导致 contentEditable 路径根本无法单测。新 helper 改成读 `target.tagName` / `target.isContentEditable`（duck-typing）：

- DOM 环境：浏览器自带这两个属性，行为不变。
- Node 单测：传 `{ tagName: 'DIV', isContentEditable: true }` 即可覆盖。

### 3.3 `consumeGPrefix`：为什么把状态留给调用方

vim 风格的 g 前缀双键最大问题是状态外泄。两种方案：

- A. 共享单例 / Context — 多页面共享 prefix 状态，跨页面误触发风险。
- B. **每个 keydown handler 自己维护 `gPrefixAt`，helper 只做纯计算** — 本轮选择。

B 的好处：helper 100% 纯函数，单测直接传 `prefixAt` 参数即可；调用方决定 prefix 生效范围（详情页只在本页有效，离开页就被 unmount handler 清理）。

### 3.4 详情页 keydown 与 `<KeyboardShortcutsButton>` 的分工

| 按键 | 谁处理 | 原因 |
|------|--------|------|
| `?` | KeyboardShortcutsButton 内部 | 全站统一行为 |
| `Esc` | KeyboardShortcutsButton 内部（仅当 open=true 时） | 与共享浮层强绑定 |
| `j` / `k` / `g+d` / `g+s` | 详情页 useEffect | 业务专属，离开页就 unmount |

两侧通过 `isTypingTarget` 共享判断逻辑，避免在 INPUT 上误触发。

### 3.5 dashboard handler 的回归收敛

dashboard 原版同一个 useEffect 里有 4 处重复的"打字 target 判断"：

```ts
const active = document.activeElement as HTMLElement | null
if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return
if (active && active.isContentEditable) return
```

本轮改成：handler 顶部一次 `if (isTypingTarget(e.target)) return`，后续分支不再重复。可读性 + bug 收敛面同时改善。

---

## 4. 测试覆盖一览

### 4.1 keyboard-shortcuts.test.ts（新增 16 个）

| # | 测试 | 断言 |
|---|------|------|
| 1 | null/undefined target → false | 防御边界 |
| 2 | INPUT/TEXTAREA/SELECT → true | 三个 tag 单独验证 |
| 3 | DIV → false | 普通元素不被误判 |
| 4 | matchShortcut: 修饰键按下 → false | meta/ctrl/alt 各一条 |
| 5 | matchShortcut: 无修饰且键值一致 → true | / 与 ? 各一条 |
| 6 | nextStepKey: 中间步可前后切 | INFO ↔ DESIGN / SCREENSHOT |
| 7 | nextStepKey: 边界不回环 | DESIGN 往前、REPORT 往后均为 null |
| 8 | nextStepKey: 未知 current → null | 防御 |
| 9 | nextStepKey: 空数组 → null | 防御 |
| 10 | consumeGPrefix: g 进入 prefix | matched=null, nextPrefixAt=now, isPrefixStart=true |
| 11 | consumeGPrefix: prefix 内按 d → matched="d" | nextPrefixAt 清零 |
| 12 | consumeGPrefix: 超时 → 不匹配 | now-prefixAt > 1500 |
| 13 | consumeGPrefix: INPUT 上按 g 不进入 prefix | 打字保护 |
| 14 | consumeGPrefix: 修饰键按 g 不进入 prefix | 不抢系统快捷键 |
| 15 | consumeGPrefix: 大写 G 同样进入 prefix | 大小写归一 |
| 16 | consumeGPrefix: prefix 下大写字母统一返回小写 | 输出归一 |

### 4.2 完整测试统计

| 状态 | 测试文件 | 测试数 |
|------|---------|--------|
| 既有 | 各 `*.test.ts` | 190 |
| 本轮新增 | `keyboard-shortcuts.test.ts` | 16 |
| **总计** | **6 个 suites** | **206 / 206 通过** |

---

## 5. 主动选择不做的事情

### 5.1 login/register 不加 skip-link

WCAG 2.4.1 "Bypass Blocks" 的设计目的是绕过**重复内容**（导航、广告条等）。login/register 都是单一表单页：

- 没有导航栏
- 没有重复块
- 整个页面就是表单本身
- 第一个可聚焦元素就是表单第一个字段

加 skip-link 反而会让用户先聚焦一个无意义的"跳转到主要内容"链接才能到达表单。本轮按"尊重原始设计"原则跳过；未来如果 login 加了顶栏 / 多 section，再补。

### 5.2 不在 layout 强制全局快捷键 Hook

考虑过把 `g d` / `g s` 提到 root layout 上做全站生效，但：

- root layout 是 Server Component，需要额外建一个 `'use client'` wrapper
- 大多数页面（settings、admin）没有 step 概念，j/k 无意义
- 跨页面 prefix 状态难以清理（unmount 时机不一致）

本轮选择"每个页面自己挂 handler"。详情页 + dashboard 已覆盖最常用场景，share 等只读页暂不需要。

### 5.3 不引入 React Testing Library

虽然规则放开了"不加依赖"，但本轮 helper 是纯函数级，`node:test` 足够。RTL 应在"需要测组件渲染交互"的场景独立引入，不在本轮硬塞。

---

## 6. 仍需人工验收的项目

按重要性排序：

### 必做

1. **新建任务 → 上传产物 → 自动分析**：流程未受本轮影响，仍按 V1 验收清单。
2. **详情页快捷键**：
   - 在 ARTIFACT step 按 `J` → 切到 REPORT
   - 在 ARTIFACT step 按 `K` → 切到 SCREENSHOT
   - 在 DESIGN step 按 `K` → 无反应（边界）
   - 按 `?` → 浮层弹出，列出 6 条快捷键
   - 浮层打开时按 `Esc` → 关闭
   - 输入框聚焦时按 `J` → 不切 step，正常输入
3. **g 前缀双键**：
   - 详情页按 `G` 然后 `D`（1.5s 内）→ 路由跳回 `/dashboard`
   - 详情页按 `G`，等 2 秒后按 `D` → 不跳转（prefix 超时）
   - 在输入框聚焦时按 `G` → 不进入 prefix，不影响输入
4. **dashboard 快捷键回归**：`/` 聚焦搜索、`N` 新建任务、`?` 浮层、`Esc` 关闭新建对话——确认与改造前行为一致。
5. **Skip-link 视觉**：
   - 任意已登录页（dashboard/任务详情/设置/admin）
   - 刷新页面后按 `Tab` → 左上角弹出"跳转到主要内容"indigo 实色按钮
   - 回车 → 焦点跳到主内容容器
   - 在首页（未登录）按 `Tab` → 同上
   - 在 share/[token] 页面按 `Tab` → 同上
6. **`<KeyboardShortcutsButton>` 在两个页面的视觉一致**：dashboard 顶栏与详情页顶栏中按钮高度对齐、悬浮色一致。

### 可选

7. **失败路径未受影响**：临时关闭 AI API → 模型卡片错误条仍按 V1.1 行为持久显示。
8. **旧任务兼容性**：打开本轮之前创建的任务 → keydown handler 仍正常工作（不依赖 evidenceChain）。

---

## 7. 自动验证结果

| 命令 | 结果 |
|------|------|
| `pnpm test` | ✅ **206 / 206 通过**（既有 190 + 新增 16） |
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ Next.js 生产构建成功，无 error/warning |
| `pnpm lint` | ⚠️ 仓库**预先存在** 205 errors / 35 warnings（`no-explicit-any` 历史问题）；本轮**未引入新 lint 错误** |

测试明细：
- `keyboard-shortcuts.test.ts` — 16 个（新增）
- `release-regression.test.ts` — 12 个
- `artifact-evidence-chain.test.ts` — 22 个
- `artifact-auto-runner.test.ts` — 10 个
- `analysis-error.test.ts` — 5 个
- `submission-markdown.test.ts` — 11 个
- 既有其它 lib 测试 — 130 个
- **总计：206 / 206**

---

## 8. test 分支 commit 增量

本轮在 main HEAD（`dcea05d`）之上新增 1 个 commit：

| Hash | Message |
|------|---------|
| `5dac040` | `feat(a11y): SkipLink + KeyboardShortcutsButton + 详情页 j/k/gd 快捷键` |

---

## 9. 风险点与遗留

1. **`consumeGPrefix` 的 prefix 超时基于 `Date.now()`**：handler 闭包内的 `gPrefixAt` 跟随渲染重建（依赖 `[currentStep]`），切 step 后 prefix 状态会被清理——这是 by-design，但意味着"按 G 然后切 step 然后按 D"不会触发跳转。如果未来希望跨 step 保留 prefix，可改成 useRef。
2. **`<KeyboardShortcutsButton>` 自托管 `?` / `Esc` 与详情页 useEffect 并存**：两个 listener 同时存在；详情页 useEffect 显式不处理 `?` 与 `Esc`，避免冲突。如果未来要在详情页关闭浮层时同时关闭别的弹层，需要把状态外提。
3. **首页 page.tsx 加了 `id="main-content"` 到 `<main>`**：原先 main 元素没有 id，本轮加上不影响样式（无 selector 命中）。
4. **lint 历史 205 errors / 35 warnings 仍未清理**：本轮零贡献，建议专门一轮清理（高粒度 PR）。
5. **未跑端到端 UI**：按用户明确"暂时没时间人工配合验收"跳过。

---

## 10. 本轮在长期规则边界上的处理

- 仍在 `test` 分支工作 ✅
- 未合并 main，未推送远程 ✅
- 未改 Prisma schema ✅
- 未新增运行时依赖 ✅（仅新增内部模块，无 package.json 变化）
- 未接入 Vercel Sandbox / 自动截图 runner ✅
- 报告未涉及 tester_upload / 截图来源 ✅
- 未改报告生成 prompt 或分析轨迹脱敏规则 ✅
- 报告本地保留，仅入 `docs/agent-reports/`（未跟踪）✅

---

## 11. 现存问题清单（供下一轮）

按"紧急问题 → 功能完善 → 体验升级 → 长期拓展"排序：

### 紧急
- 无未解决紧急问题。

### 功能完善
1. login/register 顶部"返回首页"链接的键盘可达性（按 Esc 应能返回首页？或仅 Tab 到 logo 链接？）
2. share/[token] 页面是否要复用 `<KeyboardShortcutsButton>` —— 只读页可考虑 `c` 复制报告链接、`?` 浮层
3. admin / settings 是否需要快捷键 —— admin 列表可能受益于 `/` 聚焦搜索 + `j/k` 切行

### 体验升级
1. `<KeyboardShortcutsButton>` 浮层加 focus trap（Tab 循环锁在 panel 内）
2. detail 页 `g r` 跳 REPORT step（快捷标签）
3. lint 历史 205 errors / 35 warnings 系统清理（专一轮）

### 长期拓展
1. 把 `consumeGPrefix` 状态提到全局 Context，实现真正的 vim 风格 prefix（跨页面持续 1.5s）
2. 用户偏好：在 settings 加"启用键盘快捷键"开关，存 localStorage
3. 引入 React Testing Library + 组件级渲染单测（覆盖 SkipLink / KeyboardShortcutsButton / StepSidebar）
4. e2e（Playwright）跑通"按 ? 看到浮层、按 j 切 step"流程

---

## 12. 下一轮建议优先级

1. **focus trap**（半天工作量，无新依赖，立即体验提升）
2. **lint 历史问题专一轮清理**（1-2 天，零业务风险）
3. **share/admin/settings 快捷键统一**（半天，复用本轮组件）
4. 端到端 UI 验证（需要人工配合，按用户排期）

---

报告完。
