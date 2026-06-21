# 模型测试助手 (Model Test Assistant)

AI 驱动的多模型对比评估工具。上传任务要求和多个模型的产物，AI 自动生成测试思路、分析截图、深度对比、产出结构化评估报告。

## 功能特性

### 六步向导式工作流
1. **任务设计 (DESIGN)** - AI 协助设计高质量评测任务（编码型 / Agent 型），支持自动生成起始代码仓库
2. **任务信息 (INFO)** - 填写任务名称、场景分类、需求类型、任务说明，上传相关附件
3. **测试思路 (IDEA)** - AI 基于任务信息和用户背景，自动生成测试思路和评估维度建议，支持对话调整
4. **看板识别 (SCREENSHOT)** - 上传执行过程截图和数据看板截图，AI 自动识别模型、提取过程和硬指标
5. **产物分析 (ARTIFACT)** - 上传各模型的产物文件/文本，AI 进行多维度深度对比分析（后台异步 workflow 处理）
6. **评估报告 (REPORT)** - 生成第一人称视角的结构化报告（5 个模块：产物效果反馈 / 综合表现 / 交付效率 / 产物质量 / 执行轨迹分析），支持对话微调、一键复制、批量导出

### 验证证据链
- 📸 **产物效果截图** - 支持手动上传验证截图，作为评估的可信证据来源
- 🔍 **自动截图验证** - 服务端 Chromium 自动对产物进行截图（Playwright/Puppeteer），作为独立验证证据
- 🏷️ **证据来源追溯** - 每条证据标注来源（tester_upload / screen_capture / backend_capture / sandbox_auto），只有真实来源可用于报告评估

### 其他特性
- 🔐 **邀请码注册** - 管理员生成邀请码，仅限受邀用户使用
- 🔑 **用户自带 API Key** - 每个人用自己的 AI Key，系统端到端加密存储（AES-256-GCM）
- 🎭 **背景画像** - 可设置个人背景（如程序员/HR/产品经理），AI 会以对应视角输出报告
- ⚖️ **两种接口兼容** - 支持 OpenAI 兼容接口 + Anthropic 兼容接口（DeepSeek / Groq / MiniMax / Ollama 等都能用）
- 📦 **一键导出** - 所有模型报告打包为 zip 下载
- ⚡ **后台异步分析** - 产物分析基于 workflow 异步执行，支持进度追踪，不阻塞页面操作
- 📊 **管理员后台** - 邀请码管理、用户列表、全量审计日志

## 技术栈

- **框架**: Next.js 16 (App Router) + TypeScript
- **数据库**: PostgreSQL (Neon) + Prisma ORM
- **样式**: Tailwind CSS 4
- **鉴权**: iron-session (cookie + 加密)
- **AI**: OpenAI SDK + 原生 fetch (Anthropic 兼容)
- **文件解析**: mammoth / exceljs / pdf-parse / jszip
- **异步工作流**: workflow (Next.js workflow 集成)
- **浏览器自动化**: playwright-core（本地）/ puppeteer-core + @sparticuz/chromium（Vercel）
- **部署**: Vercel + Neon + Vercel Blob

## 快速开始

### 1. 环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```env
# PostgreSQL 数据库（推荐 Neon，pooled 连接用于应用运行）
DATABASE_URL="postgresql://..."

# PostgreSQL 直连（用于 Prisma 迁移，Neon 等服务需单独配置）
DIRECT_URL="postgresql://..."

# Session 加密（32 位以上随机字符串）
SESSION_SECRET="your-32-char-session-secret"

# 用户 API Key 加密密钥（32 字节，64 位十六进制）
ENCRYPTION_KEY="your-64-char-hex-encryption-key"

# Vercel Blob（文件上传用，可选；未配置时使用本地文件存储）
BLOB_READ_WRITE_TOKEN=""

# 初始管理员账号
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 初始化数据库

```bash
pnpm db:push
pnpm db:generate
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

## 部署到 Vercel

### 一键部署

_（部署按钮待添加）_

### 手动部署步骤

1. Fork 本仓库
2. 在 Vercel 中导入项目
3. 添加环境变量（见上）
4. 数据库：在 Neon 创建数据库，复制 pooled 连接串到 `DATABASE_URL`，直连串到 `DIRECT_URL`
5. 文件上传：开启 Vercel Blob，复制 `BLOB_READ_WRITE_TOKEN`
6. 部署后在控制台执行初始化：

```bash
vercel env pull
pnpm db:push
pnpm init:admin
```

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
│   │   ├── auth/               # 登录注册
│   │   ├── admin/              # 管理员功能
│   │   ├── user/               # 用户设置
│   │   └── tasks/              # 任务相关
│   ├── login/                  # 登录页
│   ├── register/               # 注册页
│   ├── dashboard/              # 任务列表
│   ├── tasks/[id]/             # 任务详情（6 步）
│   ├── settings/               # 设置页
│   └── admin/                  # 管理后台
├── components/                 # 公共组件
└── lib/                        # 工具库
    ├── prisma.ts               # Prisma 客户端
    ├── session.ts              # Session 管理
    ├── crypto.ts               # 加密解密
    ├── ai.ts                   # AI 调用封装
    ├── ai-stream.ts            # 流式 AI 调用
    ├── ai-prompts.ts           # Prompt 模板
    ├── user-ai.ts              # 用户 AI 配置
    ├── file-parser.ts          # 文件解析
    ├── artifact-storage.ts     # 产物文件存储
    ├── artifact-analysis-runtime.ts  # 产物分析运行时
    ├── verification-evidence.ts     # 验证证据管理
    ├── audit.ts                # 审计日志
    └── text-chunker.ts         # 文本分块与摘要
```

## 数据库模型

- **User** - 用户表（含 AI 配置，API Key 加密存储）
- **InviteCode** - 邀请码
- **Task** - 测试任务（状态：DRAFT / IN_PROGRESS / COMPLETED / DELETED）
- **TaskAttachment** - 任务附件
- **TaskModel** - 任务中的待测模型（硬指标 / 过程文本 / 验证证据 / 产物分析结果）
- **ModelArtifact** - 模型产物
- **ModelReport** - 模型评估报告（5 模块 + 验证摘要 + 验证截图）
- **TaskMessage** - 对话消息
- **ArtifactAnalysisRun** - 产物分析运行记录
- **ArtifactAnalysisEvent** - 产物分析事件轨迹
- **AuditLog** - 审计日志（全量操作记录）

## 安全说明

- 用户 API Key 使用 AES-256-GCM 加密存储
- 管理员也无法查看用户的 API Key 明文
- 密码使用 bcrypt 哈希存储
- Session 使用 iron-session 加密 Cookie
- 所有 API 均有权限校验
- 全量审计日志，所有关键操作可追溯

## License

MIT
