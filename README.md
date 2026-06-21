# 模型测试助手 (ModelEval Studio)

AI 驱动的多模型对比评估工具。上传任务要求和多个模型的产物，AI 自动生成测试思路、分析截图、深度对比、产出结构化评估报告。

## 功能特性

### 六步向导式工作流
1. **任务设计 (DESIGN)** — AI 协助设计高质量评测任务（编码型 / Agent 型），支持自动生成起始代码仓库
2. **任务信息 (INFO)** — 填写任务名称、场景分类、需求类型、任务说明，上传相关附件
3. **测试思路 (IDEA)** — AI 基于任务信息和用户背景，自动生成测试思路和评估维度建议，支持对话调整
4. **看板识别 (SCREENSHOT)** — 上传执行过程截图和数据看板截图，AI 自动识别模型、提取过程和硬指标
5. **产物分析 (ARTIFACT)** — 上传各模型的产物文件/文本，AI 进行多维度深度对比分析（后台异步 workflow 处理）
6. **评估报告 (REPORT)** — 生成第一人称视角的结构化报告（5 个模块：产物效果反馈 / 综合表现 / 交付效率 / 产物质量 / 执行轨迹分析），支持对话微调、一键复制、批量导出

### 评分模板（Rubric）
- 📐 **两套预设模板**：编码型（CODING：需求完成度 50% + 代码质量 30% + 交付效率 20% 含封顶规则）与 Agent 型（AGENT：指令遵循/规划/工具/推理/幻觉/结果 六维加权）
- 🔧 **自定义维度**：任务 Owner 可覆盖默认模板，调整维度名、权重、描述、扣分点
- 🧩 **AI Prompt 动态适配**：生成报告时会基于当前任务的 rubric 动态拼装指导文本

### 报告版本与人工修订
- 📜 **版本链**：每次 AI 生成或人工修订都会生成新版本，版本号单调递增
- ✍️ **人工修订**：查看者可基于任一版本创建人工修订版（评分、评论、轨迹、说明均可修改）
- 📷 **生成依据快照**：每个版本记录生成时的 AI 模型、token 用量、产物签名、过程文本哈希、耗时等元信息，便于审计复现
- 🔀 **修订关系**：parentReportId 形成修订链，版本历史面板可浏览/切换任意历史版本

### 协作与共享
- 👥 **协作者机制**：任务 Owner 可邀请协作者，支持 `EDITOR`（可编辑/生成报告）和 `VIEWER`（只读）两种角色；协作者可自行退出
- 🔗 **公开只读链接**：生成 `sh_xxx` 形式的共享 token（可设置过期时间），任何人通过 `/share/[token]` 即可查看只读页面，无需登录；token 使用密码学安全的 `crypto.randomBytes` 生成
- 🛡️ **统一权限中间件**：所有 API 通过 `src/lib/task-access.ts` 统一鉴权（Owner → Admin 只读 → Collaborator → Public Share），避免散落的硬编码 userId 过滤
- 🚪 **只读公开页**：字段白名单裁剪，不返回 messages/API Key/generationSnapshot 等内部字段
- 📋 **Dashboard 视图**："我的任务"与"共享给我"分 Tab 展示

### 验证证据链
- 📸 **产物效果截图** — 支持手动上传验证截图，作为评估的可信证据来源
- 🏷️ **证据来源追溯** — 每条证据标注来源（tester_upload / screen_capture / backend_capture / sandbox_auto），只有真实来源可用于报告评估

### 其他特性
- 🔐 **邀请码注册** — 管理员生成邀请码，仅限受邀用户使用
- 🔑 **用户自带 API Key** — 每个人用自己的 AI Key，系统端到端加密存储（AES-256-GCM）
- 🎭 **背景画像** — 可设置个人背景（如程序员/HR/产品经理），AI 会以对应视角输出报告
- ⚖️ **两种接口兼容** — 支持 OpenAI 兼容接口 + Anthropic 兼容接口（DeepSeek / Groq / MiniMax / Ollama 等都能用）
- 📦 **一键导出** — 所有模型报告打包为 zip 下载
- ⚡ **后台异步分析** — 产物分析基于 workflow 异步执行，支持进度追踪，不阻塞页面操作
- 📊 **管理员后台** — 邀请码管理、用户列表、全量审计日志
- 🧪 **单元测试** — `pnpm test` 运行 node:test 驱动的纯函数测试（已覆盖 rubric 模板、版本快照、权限判断等核心模块）

## 技术栈

- **框架**: Next.js 16 (App Router) + TypeScript
- **数据库**: PostgreSQL (推荐 Neon) + Prisma ORM
- **样式**: Tailwind CSS 4 + lucide-react
- **鉴权**: iron-session (cookie + 加密)
- **AI**: OpenAI SDK + 原生 fetch (Anthropic 兼容)
- **文件解析**: mammoth / exceljs / pdf-parse / jszip
- **异步工作流**: workflow (Next.js workflow 集成)
- **文件存储**: Vercel Blob（生产）/ 本地文件系统（开发）
- **部署**: Vercel + Neon + Vercel Blob

## 快速开始

### 1. 环境变量

复制 `.env.example` 为 `.env.local` 并填写。关键变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL pooled 连接串（Neon 推荐带 `?pgbouncer=true`） |
| `DIRECT_URL` | ✅ | PostgreSQL 直连串（Prisma 迁移用，Neon 必需） |
| `SESSION_SECRET` | ✅ | iron-session 密钥（≥32 字符随机串） |
| `ENCRYPTION_KEY` | ✅ | 用户 API Key 的 AES-256 密钥，推荐 64 位十六进制。可用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
| `BLOB_READ_WRITE_TOKEN` | 可选 | Vercel Blob 令牌；未配置时使用本地 `.local-artifacts/` 存储 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | ✅ | 初始化管理员账号（首次 `pnpm init:admin` 使用） |

### 2. 安装依赖

```bash
pnpm install
```

### 3. 初始化数据库

```bash
pnpm db:generate   # 生成 Prisma Client
pnpm db:migrate    # 应用迁移（开发/生产均可）
# 或在首次快速本地验证时使用 pnpm db:push（不生成迁移历史）
```

### 4. 创建管理员

```bash
pnpm init:admin
```

### 5. 启动开发服务器

```bash
pnpm dev
```

打开 http://localhost:3000 ，用管理员账号登录。

### 6. 运行测试

```bash
pnpm test
```

项目使用 Node 原生 `node:test` 运行器（`tsx` 直接跑 TS），无需 Jest/Vitest。新增测试放在 `src/lib/*.test.ts`。

### 7. 代码检查 & 构建

```bash
pnpm lint     # ESLint
pnpm build    # Next.js 生产构建（会自动在 VERCEL_ENV=production 时跑 prisma migrate deploy）
```

## 部署到 Vercel

### 手动部署步骤

1. Fork 本仓库
2. 在 Vercel 中导入项目
3. 添加环境变量（见上表）
4. 数据库：在 Neon 创建数据库，把 pooled 连接串填到 `DATABASE_URL`，直连串填到 `DIRECT_URL`
5. 文件上传（可选）：在 Vercel 控制台开启 Blob 存储，平台会自动注入 `BLOB_READ_WRITE_TOKEN`
6. 首次部署完成后，在本地或 Vercel 控制台执行管理员初始化：
   ```bash
   vercel env pull .env.production
   pnpm init:admin
   ```
7. 后续 push 到 main 时 `next build` 会通过 `scripts/migrate-if-production.js` 自动执行 `prisma migrate deploy`，无需手动跑迁移。

## 配置 AI 接口

登录后进入「设置」页面，配置你的 AI API：

### OpenAI 兼容接口
- Base URL: 如 `https://api.openai.com/v1`、`https://api.deepseek.com/v1`
- API Key: 你的 API Key
- 模型名: 如 `gpt-4o`、`deepseek-chat`

### Anthropic 兼容接口
- Base URL: 如 `https://api.minimaxi.com/anthropic`
- API Key: 你的 API Key
- 模型名: 如 `abab6.5s`、`MiniMax-M3`

> ⚠️ 多模态截图解析功能仅支持 OpenAI 兼容格式的视觉模型。

## 项目结构

```
src/
├── app/
│   ├── api/                    # API 路由
│   │   ├── auth/               # 登录/注册/登出/me
│   │   ├── admin/              # 管理员（用户、邀请码、审计日志、统计）
│   │   ├── user/               # 用户设置（AI 配置、背景画像）
│   │   ├── rubrics/            # 评分模板列表
│   │   ├── share/[token]/      # 公开只读链接接口（无鉴权）
│   │   └── tasks/[id]/         # 任务相关
│   │       ├── rubric/         # 评分规则读写
│   │       ├── collaborators/  # 协作者管理
│   │       ├── shares/         # 共享链接管理
│   │       ├── models/         # 模型、产物、截图、消息、分析、报告
│   │       └── ...
│   ├── login/ register/        # 登录注册页
│   ├── dashboard/              # 任务列表（我的 / 共享给我）
│   ├── tasks/[id]/             # 任务详情（6 步向导）
│   ├── share/[token]/          # 公开只读审阅页
│   ├── settings/               # 用户设置
│   └── admin/                  # 管理后台
├── components/
│   ├── tasks/SharePanel.tsx    # 协作者 / 共享链接管理面板
│   └── ui/                     # 基础 UI 组件
└── lib/
    ├── prisma.ts               # Prisma 客户端单例
    ├── session.ts              # iron-session 管理
    ├── crypto.ts               # AES-256-GCM 加密（支持 64 位 hex key）
    ├── ai.ts / ai-stream.ts    # AI 调用与流式封装
    ├── ai-prompts.ts           # Prompt 模板（动态注入 rubric）
    ├── ai-endpoint.ts / ai-content.ts  # 端点配置与内容过滤
    ├── user-ai.ts              # 用户 AI 配置读取
    ├── file-parser.ts          # docx/xlsx/pdf/zip 等文件解析
    ├── artifact-storage.ts     # Vercel Blob / 本地存储适配
    ├── artifact-analysis-runtime.ts  # workflow 异步分析运行时
    ├── artifact-preview.ts     # 产物预览
    ├── design-output.ts        # 任务设计输出
    ├── model-artifact-analysis.ts    # 产物分析
    ├── report-generation.ts    # AI 报告生成
    ├── report-parser.ts        # 报告解析
    ├── report-versioning.ts    # 版本号、快照、人工修订（含并发重试）
    ├── rubric-templates.ts     # CODING/AGENT 预设模板、校验、序列化、指导 prompt
    ├── task-access.ts          # 统一权限中间件（Owner/Editor/Viewer/Public/Admin）
    ├── task-messages.ts        # 对话消息持久化
    ├── verification-evidence.ts # 验证证据签名/过滤
    ├── trajectory-screenshots.ts     # 轨迹截图处理
    ├── rate-limit.ts           # IP/用户名限流
    ├── api-error.ts            # 统一错误响应
    ├── audit.ts                # 审计日志
    ├── text-chunker.ts         # 文本分块与摘要
    └── utils.ts                # 通用工具
```

## 数据库模型

| 表 | 说明 |
|----|------|
| **User** | 用户（密码 bcrypt；API Key AES-256-GCM 加密存储；role: USER/ADMIN） |
| **InviteCode** | 邀请码（创建者 / 最大使用次数 / 过期时间 / 使用数） |
| **Task** | 测试任务（状态 DRAFT/IN_PROGRESS/COMPLETED/DELETED；含 category/taskType） |
| **TaskAttachment** | 任务附件 |
| **EvaluationRubric** | 任务自定义评分规则（1:1 关联任务；templateType/dimensionsJson/overallFormula） |
| **TaskModel** | 任务中的待测模型（硬指标/过程文本/验证证据/产物分析结果） |
| **ModelArtifact** | 模型产物文件（存储在 Vercel Blob 或本地） |
| **ModelReport** | 模型评估报告（含 version/source/parentReportId/editedById/editNote，`(taskModelId,version)` 唯一；generationSnapshot/generationConfig 为快照） |
| **TaskMessage** | 对话消息（user/assistant/system） |
| **TaskCollaborator** | 协作者（taskId+userId 唯一；role: VIEWER/EDITOR） |
| **TaskShare** | 公开共享链接（唯一 token；accessType=VIEW；expiresAt；createdById 级联） |
| **ArtifactAnalysisRun** | 产物分析运行记录（异步 workflow） |
| **ArtifactAnalysisEvent** | 产物分析事件轨迹 |
| **AuditLog** | 审计日志（按 userId/action/taskId/createdAt 索引） |
| **RateLimitBucket** | 登录注册限流桶 |

### 级联策略
- 删除 `Task`：级联删除 TaskAttachment/EvaluationRubric/TaskModel/TaskMessage/TaskShare/TaskCollaborator；TaskModel 再级联删除 ModelArtifact/ModelReport/ArtifactAnalysisRun/ArtifactAnalysisEvent
- 删除 `User`：级联删除其 Task/TaskCollaborator/创建的 TaskShare；ModelReport.editedById 与 AuditLog.userId 置为 NULL
- 删除 `ModelReport`（父版本）：子版本 `parentReportId` 置 NULL

## 安全说明

- 用户 API Key 使用 AES-256-GCM 加密存储；`ENCRYPTION_KEY` 推荐使用 `crypto.randomBytes(32).toString('hex')` 生成的 64 位十六进制字符串
- 管理员无法查看用户的 API Key 明文（仅 `hasApiKey` 标志）
- 密码使用 bcrypt 哈希存储
- Session 使用 iron-session 加密 Cookie
- 所有写 API 均经过 `requireAuth()` + `getTaskAccess()` + `requireAccess()` 三层鉴权
- 公开只读接口对返回字段严格白名单裁剪，不暴露内部快照、消息、协作者、密钥
- 共享 token 使用 192 bit CSPRNG 随机数（`crypto.randomBytes(24).toString('base64url')`），不可预测
- 全量审计日志，关键操作可追溯
- 登录/注册接口按 IP + 用户身份做限流

## 开发规范

- TypeScript 严格模式，提交前请运行 `npx tsc --noEmit`
- 新增纯函数逻辑请在 `src/lib/` 下添加同名 `.test.ts`（参考已有 `rubric-templates.test.ts` 风格）
- API 路由内禁止直接 `userId: session.userId` 过滤任务数据，统一使用 `getTaskAccess`
- 错误处理：前端 fetch 必须检查 `res.ok` + try/catch，失败时展示内联错误条（不要使用 `alert()`）
- 剪贴板操作需提供 `document.execCommand('copy')` 兜底，非 HTTPS 环境下降级

## License

MIT
