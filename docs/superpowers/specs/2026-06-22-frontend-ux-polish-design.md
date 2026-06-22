# 前端体验优化 V1 — 设计规格

> test 分支上对前端体验做一次「横向铺开、纵向浅改」的可验收规格。
> 不拆大件、不动 schema、不加依赖、不重构 state、不接 Sandbox、不伪造截图。
> 每个口袋独立提交、单口袋失败可回滚、每个任务结束跑 `pnpm test && pnpm typecheck && pnpm build`。

**目标**：让用户在五个核心页面的日常操作中，得到更一致的反馈、更明确的状态、更顺滑的过渡、更轻量的键盘路径。

**架构**：复用现有 `globals.css` 设计 token（`--accent` / `--accent-2` / `--accent-3` / `.glass` / `.btn-glow` / `.step-pill` / `.sheet`），复用现有 toast 系统（`src/components/ui/toast.tsx` 提供 `toast.success/error/info`），所有改动仅修改 `.tsx` 与 `.css`，不新增 npm 依赖。

**Tech Stack**：Next.js 14 App Router · React 19 · TypeScript strict · Tailwind v4 · lucide-react · 已存在的 toast store。

---

## 0. 约束与不在范围内

### 0.1 硬约束

- 不修改 `prisma/schema.prisma`
- 不新增 npm 依赖
- 不动 `StepReport.tsx`（1278 行）内部结构、不拆它、不抽它
- 不动容器层 `src/app/tasks/[id]/page.tsx` 的 30+ `useState` 排布
- 不动 `isAuthenticVerificationEvidence` 白名单、不伪造 `tester_upload`
- 每一处改动必须 100% 复用现有 `.tsx` / `.css` / toast，不引入新的设计语言
- 每个 task 结束必须 `pnpm test && pnpm typecheck && pnpm build` 三项全过
- 每完成一个口袋写一份报告到 `docs/agent-reports/YYYY-MM-DD-<pocket>.md`

### 0.2 不在范围（明确推迟）

- 移动端响应式深度优化（断点细化、抽屉式导航）
- StepReport 拆分子组件、容器层 state 重构、路由拆分
- 设计 token 体系重构、暗色 / 亮色主题切换
- i18n、a11y WCAG AA 全量审计
- 动画引擎替换（framer-motion 等）
- 视觉陪护与设计稿系统化沉淀

### 0.3 交付物

- 一份本 spec（已落盘）
- 5 个口袋各自 1 个 commit、1 份本地报告
- 全部完成后 1 份汇总报告 `docs/agent-reports/2026-06-22-frontend-ux-polish-summary.md`

---

## 1. 文件清单（先确定边界）

| 文件 | 状态 | 职责 |
|---|---|---|
| `src/app/globals.css` | 修改 | 新增 4-6 个工具类（骨架、错误态容器、focus-visible 一致化） |
| `src/app/page.tsx` | 修改 | 把 `NavBtn` 从底部提到顶部、合并两处硬编码颜色 |
| `src/app/dashboard/page.tsx` | 修改 | 错误态抽空态、复制成功改 toast |
| `src/app/tasks/[id]/page.tsx` | 修改 | 内嵌红字 → toast、新增快捷键提示 |
| `src/app/tasks/[id]/StepScreenshot.tsx` | 修改 | 复制 / 删除改 toast、骨架占位 |
| `src/app/tasks/[id]/StepArtifact.tsx` | 修改 | 复制 / 删除改 toast、骨架占位 |
| `src/app/tasks/[id]/StepDesign.tsx` | 修改 | 下载错误改 toast |
| `src/app/share/[token]/page.tsx` | 修改 | 错误态 fallback 文案 |
| `src/app/login/page.tsx` / `src/app/register/page.tsx` | 修改 | 内嵌错误改 toast |
| `src/components/tasks/SharePanel.tsx` | 修改 | 复制改 toast |
| `src/components/tasks/VerificationEvidencePanel.tsx` | 修改 | 复制改 toast（若存在） |
| `src/app/tasks/[id]/StepInfo.tsx` | 修改 | 错误提示统一 |

> 不新增文件、不抽 hook、不动测试基础设施。

---

## 2. 口袋 A：设计系统一致性

### A-1 收拢硬编码颜色

**文件**：`src/app/page.tsx`

- [ ] **A-1.1 现状摸排**：扫一遍 `src/app/page.tsx`，统计硬编码的 hex / `rgb(...)` / Tailwind 内置色（如 `text-indigo-500`），列出位置（行号 + 颜色值），写到 commit message 里。
- [ ] **A-1.2 改写**：把明显重复的颜色（出现 ≥2 次或与 token 同语义）替换为：
  - 文本强调 → `var(--accent)` 或 `text-gradient`
  - 次级文本 → `var(--text-2)`（若 `globals.css` 未定义，加一条注释说明使用现有的 `--text` 变体）
  - 渐变 → `linear-gradient(var(--accent), var(--accent-2))`
- [ ] **A-1.3 验证**：
  - `pnpm typecheck` 通过
  - 浏览器访问 `/`，肉眼比对：颜色与之前一致、无视觉回退
  - `git diff src/app/page.tsx | grep -E "#[0-9a-fA-F]{3,8}|rgb\("` 输出 0 行（不允许新增硬编码）

### A-2 NavBtn 提到顶部

**文件**：`src/app/page.tsx`

- [ ] **A-2.1 现状**：`NavBtn` 在 `src/app/page.tsx` 第 279+ 行定义，被 87-88 行使用，靠函数提升顶上。
- [ ] **A-2.2 改写**：把 `NavBtn` 的定义从底部移到顶部（紧跟其它 import 之后、JSX 之前），移除因为函数提升而能编译的注释 / 提示。
- [ ] **A-2.3 验证**：
  - `pnpm typecheck` 通过
  - 浏览器访问 `/`，导航交互行为不变
  - `git diff src/app/page.tsx` 仅展示位置变化，无逻辑修改

### A-3 focus-visible 一致化

**文件**：`src/app/globals.css`

- [ ] **A-3.1 改写**：新增一条全局规则（追加到现有 `:root` 之后、其它 utility 之前）：

```css
:where(button, a, [role="button"], input, select, textarea):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 6px;
}
```

- [ ] **A-3.2 验证**：
  - 用 Tab 键在 dashboard / 任务详情页 / 登录页各走一遍，肉眼确认聚焦环一致且不破坏现有玻璃面板视觉
  - `pnpm build` 通过

---

## 3. 口袋 B：加载 / 空 / 错误三态 + Toast 一致性

### B-1 错误态统一容器

**文件**：`src/app/globals.css`

- [ ] **B-1.1 改写**：新增工具类（追加到 `.glass` 附近）：

```css
.error-state {
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.error-state__title { font-weight: 600; }
.error-state__detail { color: var(--text-2, rgba(255,255,255,0.7)); font-size: 0.875rem; }
```

- [ ] **B-1.2 验证**：在 `dashboard/page.tsx` 的错误分支里临时套用一次（验证类可用），验证后回滚到原样。

### B-2 内嵌红字迁 Toast

**文件**：
- `src/app/dashboard/page.tsx`
- `src/app/tasks/[id]/page.tsx`
- `src/app/tasks/[id]/StepScreenshot.tsx`
- `src/app/tasks/[id]/StepArtifact.tsx`
- `src/app/tasks/[id]/StepDesign.tsx`
- `src/app/tasks/[id]/StepInfo.tsx`
- `src/components/tasks/SharePanel.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`

- [ ] **B-2.1 摸排**：用 Grep `actionError|setError\(|setMessage\(` 找出所有内嵌错误状态，每处记录：文件、行号、原错误文案、对应操作。
- [ ] **B-2.2 改写**：把 catch 分支里的 `setXxxError(msg)` + JSX 里 `{xxxError && <div className="text-red-...">{xxxError}</div>}` 改为 `toast.error(msg)`。
  - 保留：表单字段级错误（与字段绑定的 helperText）
  - 迁移：操作级错误（点击按钮 / API 调用失败）
  - 不删除用于追踪状态的变量本身，但移除对应 JSX 渲染
- [ ] **B-2.3 验证**：
  - `pnpm test` 通过
  - 浏览器分别复现：复制任务失败、复制分享链接失败、删除截图失败、生成报告失败、登录失败、注册失败——均看到 toast 弹出、不再看到页面内的红字块
  - toast 在 3.5s 后自动消失

### B-3 加载骨架占位

**文件**：`src/app/tasks/[id]/StepScreenshot.tsx`

- [ ] **B-3.1 现状**：截图列表加载中（首屏、刷新）目前是直接渲染空。
- [ ] **B-3.2 改写**：在加载分支（已有 `loading` 状态时）渲染 3 个骨架卡片：

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {[0,1,2].map(i => (
    <div key={i} className="glass rounded-xl p-4 h-32 animate-pulse" />
  ))}
</div>
```

- [ ] **B-3.3 验证**：浏览器刷新 `/tasks/<id>`，截图步骤在数据回来前看到 3 个骨架、回来后无缝替换为真实列表。

### B-4 失败重试入口

**文件**：`src/app/share/[token]/page.tsx`

- [ ] **B-4.1 现状**：分享页加载失败时仅显示错误文案，没有重试入口。
- [ ] **B-4.2 改写**：在错误分支加一个「重试」按钮，点击调用现有的 `load()` / `fetch()`（不新增状态机，绑到现有的 refresh 函数）。
- [ ] **B-4.3 验证**：手动断网 / 改坏 token 后访问分享页，看到错误 + 重试按钮；点击后重新发起请求。

---

## 4. 口袋 C：微动效与微反馈

### C-1 复制成功打勾

**文件**：
- `src/app/tasks/[id]/StepScreenshot.tsx`
- `src/app/tasks/[id]/StepArtifact.tsx`
- `src/components/tasks/SharePanel.tsx`

- [ ] **C-1.1 摸排**：找出所有"复制 URL/链接"按钮的实现位置（图标 + tooltip 文案）。
- [ ] **C-1.2 改写**：在成功 callback 里加一个局部状态 `justCopied`，800ms 后清除。按钮在 `justCopied` 期间：
  - 图标从 `Copy` 切到 `Check`
  - tooltip 文案从「复制链接」切到「已复制」
- [ ] **C-1.3 验证**：
  - 浏览器实测每个复制按钮，视觉切换 ≤ 1s
  - `pnpm typecheck` 通过

### C-2 步骤高亮迁移动画

**文件**：`src/app/tasks/[id]/StepSidebar.tsx`

- [ ] **C-2.1 现状**：侧边栏步进点切换 active 时是直接换色。
- [ ] **C-2.2 改写**：复用 `globals.css` 已有的 `@keyframes glow-pulse`，给 active 步骤加 `animation: glow-pulse 1.2s ease-out`（只触发一次，不持续循环）。
- [ ] **C-2.3 验证**：浏览器切换步骤，看到新 active 点闪一次高亮、然后稳定。

### C-3 上传完成过渡

**文件**：`src/app/tasks/[id]/StepScreenshot.tsx`

- [ ] **C-3.1 现状**：上传完一张截图直接出现在列表顶部，没有过渡。
- [ ] **C-3.2 改写**：给新插入的截图卡片加 200ms `rise` 动画（`globals.css` 已定义 `@keyframes rise`）。
- [ ] **C-3.3 验证**：浏览器上传一张截图，看到新条目有从下到上的轻量入场。

---

## 5. 口袋 D：键盘与导航

### D-1 快捷键提示浮层

**文件**：`src/app/dashboard/page.tsx`

- [ ] **D-1.1 现状**：`/` 聚焦搜索、`N` 新建任务已有实现。
- [ ] **D-1.2 改写**：在页面角落新增一个「?」图标按钮，点击弹出快捷键浮层（用现有 `.sheet` 工具类）。浮层列出：
  - `/` 聚焦搜索
  - `N` 新建任务
  - `Esc` 关闭弹层
- [ ] **D-1.3 验证**：浏览器点 `?` 看到浮层、`Esc` 关闭。

### D-2 任务详情页快捷键

**文件**：`src/app/tasks/[id]/page.tsx`

- [ ] **D-2.1 改写**：新增键盘监听：
  - `j` / `k` → 上下切换步骤（同步现有 `setActiveStep` 状态）
  - `g g` → 跳到 `/dashboard`
  - `?` → 弹出快捷键浮层（复用 D-1 的样式）
- [ ] **D-2.2 注意**：监听挂载在容器 `useEffect`，卸载时 `removeEventListener`；输入框聚焦时不触发（检查 `e.target.tagName`）。
- [ ] **D-2.3 验证**：浏览器在任务详情页按 `j`/`k` 切步骤、按 `g g` 回列表，焦点在文本框时不触发。

### D-3 Skip link

**文件**：`src/app/dashboard/page.tsx` 与 `src/app/tasks/[id]/page.tsx`

- [ ] **D-3.1 改写**：在主内容区前加一个 `<a href="#main" className="sr-only focus:not-sr-only ...">`，Tab 到时显示「跳到主内容」。
- [ ] **D-3.2 验证**：浏览器 Tab 第一下看到 skip link 出现。

---

## 6. 口袋 E：首页 / 列表页微调

### E-1 列表项 hover 反馈

**文件**：`src/app/dashboard/page.tsx`

- [ ] **E-1.1 现状**：列表项已有 `hover:bg-white/5`，但 hover 进入的「复制/删除」按钮组位置突兀。
- [ ] **E-1.2 改写**：按钮组默认 `opacity-0`，行 hover 时 `opacity-100`，过渡 150ms。
- [ ] **E-1.3 验证**：鼠标移到行上，按钮组淡入；离开后淡出。

### E-2 首页 CTA 按钮聚焦环

**文件**：`src/app/page.tsx`

- [ ] **E-2.1 现状**：首页 CTA 用了 `.btn-glow`，但 focus 时视觉反馈弱。
- [ ] **E-2.2 改写**：在 `.btn-glow` 选择器里追加 `&:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }`。
- [ ] **E-2.3 验证**：Tab 到 CTA 按钮看到外圈高亮。

---

## 7. 风险与回滚

| 口袋 | 风险 | 回滚方式 |
|---|---|---|
| A 设计系统 | 颜色替换可能与暗色面板对比度不足 | 单 commit 内逐项 revert；保留现状 |
| B Toast 统一 | 迁移后丢失上下文位置提示 | 保留位置性 helperText 的判断；先迁移 2 个文件试水 |
| C 微动效 | 频繁动画在低性能机器掉帧 | CSS 动画天然 GPU 友好；若有问题加 `@media (prefers-reduced-motion)` 包裹 |
| D 快捷键 | 与浏览器 / 扩展快捷键冲突 | 仅在不聚焦输入框时触发；冲突时回滚单个 key |
| E 首页微调 | 改动小，风险低 | 单文件 revert |

---

## 8. 验收门槛

每个 task 结束必须：

```bash
pnpm test       # 190+ tests must pass
pnpm typecheck  # 0 errors
pnpm build      # success
```

每个口袋完成必须：

- 1 个独立 commit（消息含口袋代号 `ux-A` / `ux-B` / `ux-C` / `ux-D` / `ux-E`）
- 1 份本地报告 `docs/agent-reports/YYYY-MM-DD-<pocket>-v1.md`

全部 5 个口袋完成后：

- 1 份汇总报告 `docs/agent-reports/2026-06-22-frontend-ux-polish-summary.md`
- 聊天返回 `git status -sb` + 路径列表 + 一句话总结

---

## 9. 自检清单（落盘前过一遍）

- [ ] 每个改动项都有"现状 → 改写 → 验证"三步
- [ ] 每个文件路径精确到行号或函数级
- [ ] 没有"TBD / 类似 / 适当 / 后续"占位词
- [ ] 没有新增 npm 依赖、没有 schema 改动、没有 StepReport 内部结构改动
- [ ] 5 个口袋之间无依赖、顺序可调换
- [ ] 验收命令在文档中明确且与项目现有脚本一致