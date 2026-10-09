# 前端体验优化 V1 设计规格 — 完成报告

> test 分支上「前端体验看看还能不能优化」的产物：一份设计规格文档。
> 不提交 docs/agent-reports/，作为本地验收材料。

---

## 1. 本轮完成内容

| 目标 | 状态 | 说明 |
|------|------|------|
| 范围澄清 | ✅ | 走完 brainstorming，明确"横向铺开、纵向浅改"，不动 StepReport、不动 schema、不加依赖 |
| 设计规格文档 | ✅ | 落盘 316 行可验收规格，覆盖 5 个独立口袋、16 个具体动作 |

---

## 2. 口袋概览

| 口袋 | 项目数 | 风险 |
|---|---|---|
| A 设计系统一致性 | 3 | 低 |
| B 加载/空/错误三态 + Toast | 4 | 中 |
| C 微动效与微反馈 | 3 | 低 |
| D 键盘与导航 | 3 | 中 |
| E 首页/列表页微调 | 2 | 低 |

---

## 3. 关键约束（已写入 spec）

- 不动 `prisma/schema.prisma`
- 不新增 npm 依赖
- 不拆 `StepReport.tsx`（1278 行），不动容器层 30+ `useState` 结构
- 不伪造 `tester_upload`，不接 Sandbox
- 每个 task 结束必须 `pnpm test && pnpm typecheck && pnpm build` 三项全过
- 每个口袋 1 个 commit（代号 `ux-A` / `ux-B` / `ux-C` / `ux-D` / `ux-E`）、1 份本地报告

---

## 4. 不在范围内（明确推迟）

- 移动端响应式深度优化
- StepReport 拆分子组件 / 容器 state 重构 / 路由拆分
- 设计 token 体系重构、亮色主题
- i18n、WCAG AA 全量审计
- 动画引擎替换

---

## 5. 落地文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `docs/superpowers/specs/2026-06-22-frontend-ux-polish-design.md` | 新增 316 行 | 完整设计规格 |
| `docs/superpowers/` | 新建目录 | spec/plan 收纳位置 |

---

## 6. 下一步

spec 已落盘并提交（`a6a6cb3`），等待用户 review。review 通过后切换到 `writing-plans` 写实施 plan，再按 5 个口袋顺序（浅 → 深）逐步提交。