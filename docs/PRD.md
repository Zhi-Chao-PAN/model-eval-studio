# Model Test Assistant - 产品需求文档

## 项目概述
一个面向大模型能力评测场景的 AI 辅助分析工具。用户上传测试任务信息和各模型产物后，AI 自动生成专业的对比评估报告。

## 目标用户
- 产品经理 / 测试人员：进行大模型能力评测
- 管理员：管理邀请码和用户

## 核心功能

### 1. 用户系统
- 邀请码注册：管理员生成邀请码，用户凭邀请码注册账号
- 用户名 + 密码登录
- 角色：ADMIN / USER
- 管理员后台：
  - 生成 / 禁用邀请码
  - 查看用户列表和活跃情况
  - 重置用户密码 / 背景

### 2. 用户背景设置
- 每个用户可以设置自己的背景资料（自由文本）
- 背景会作为系统提示的一部分，影响 AI 输出的视角和风格
- 每次任务可以选择性地临时调整背景

### 3. AI API 配置
- 支持两种 Provider：
  - OpenAI 兼容接口（base_url + api_key + model）
  - Anthropic 兼容接口（base_url + api_key + model）
- API Key 使用 AES-256-GCM 加密存储
- 提供验证按钮，测试 API 是否可用
- 用户可以随时切换模型

### 4. 任务工作流（6 步向导）

#### 步骤 0：任务设计
- 支持两种任务类型：编码型 / Agent 型
- AI 协助设计高质量评测任务 prompt
- 可自动生成起始代码仓库
- 作为任务的入口步骤，设计完成后进入任务信息填写

#### 步骤 1：任务信息
- 任务名称
- 场景分类
- 需求类别 / 需求名称
- 任务说明（多行文本）
- 背景资料（可临时调整）

#### 步骤 2：测试思路
- AI 基于任务信息生成测试思路
- 可与 AI 对话调整
- 输出结构化的测试思路建议

#### 步骤 3：看板识别（截图分析）
- 两个 Tab：执行过程截图 / 数据看板截图
- 支持多图上传（base64）
- AI 多模态分析，自动识别：
  - 待测模型数量和代号
  - 各模型状态、工具调用次数、耗时等硬指标
- 自动创建 / 更新模型记录
- 可与 AI 对话调整

#### 步骤 4：产物分析
- 按模型分栏展示
- 每个模型支持：
  - 粘贴文本产物
  - 上传文件（PDF / Word / Excel / PPT / 文本 / ZIP）
  - ZIP 自动解压并解析所有文本文件
- 文件自动解析提取文本内容
- 后台异步 workflow 深度分析
- 深度分析前 N 个主要文件，其余文件列入清单
- 分析完成后有验证截图的模型自动触发报告生成
- 可与 AI 对话调整

#### 步骤 5：评估报告
- 对每个模型生成结构化评估报告
- 报告包含五个维度：
  1. 产物效果反馈
  2. 综合表现评分（1-10，支持 0.5 分精度）+ 评论
  3. 交付效率评分 + 评论
  4. 产物质量评分 + 评论
  5. 执行轨迹分析
- 支持 AI 调整报告（输入修改指令，AI 重写）
- 验证截图作为报告评估的可信证据
- 报告文本方便用户复制粘贴
- 可导出 ZIP 打包所有报告

### 5. 对话系统
- 每个任务有统一的 AI 对话面板（右下角浮动）
- 对话历史全局共享，不按步骤隔离
- AI 始终带着任务上下文和用户背景
- 消息持久化存储
- 支持 SSE 流式输出

### 6. 任务管理
- 任务列表（dashboard）
- 新建 / 删除任务
- 导出任务报告（ZIP）
- 任务状态：DRAFT / IN_PROGRESS / COMPLETED / DELETED

## 技术架构

### 前端
- Next.js 16 (App Router) + TypeScript
- React 19
- Tailwind CSS 4
- 浅色专业风格 UI → 深色高端科技风格
- 新增产物效果截图（验证证据）功能
- 新增后台异步产物分析（workflow）
- 新增执行轨迹分析报告模块

### 后端
- Next.js API Routes
- Prisma ORM + PostgreSQL（Neon）
- iron-session 会话管理
- bcryptjs 密码哈希
- AES-256-GCM 加密敏感数据

### AI 集成
- OpenAI SDK（OpenAI 兼容模式）
- 原生 fetch（Anthropic 兼容模式）
- 多模态：OpenAI 兼容模式的 image_url 格式
- 文件解析：mammoth / exceljs / pdf-parse / jszip

### 部署
- 平台：Vercel
- 数据库：Neon PostgreSQL
- 文件存储：Vercel Blob（生产）/ 本地文件系统（开发，`.local-artifacts/`）
- 构建时自动执行 `prisma migrate deploy`（见 `scripts/migrate-if-production.js`），部署后首次需手动 `pnpm init:admin` 初始化管理员

## 数据模型

### User
- id, username, passwordHash, role
- background, aiProvider, aiBaseUrl, aiApiKey(encrypted), aiModelName, aiMaxTokens
- createdAt, lastActiveAt

### InviteCode
- id, code, expiresAt, maxUses, usedCount, active
- createdById, createdAt

### Task
- id, userId, title, category, requirementType, requirementName
- description, backgroundUsed
- status, currentStep, deletedAt, deletedBy
- taskIdeaJson, analysisJson
- createdAt, updatedAt

### TaskAttachment
- id, taskId, name, url, size, mimeType, parsedText
- createdAt

### TaskModel
- id, taskId, modelCode, displayName
- hardMetricsJson, processText, screenshotUrls
- verificationScreenshotUrls, artifactAnalysisJson
- createdAt

### ModelArtifact
- id, taskModelId, name, url, textContent
- mimeType, size, parsedText, previewJson
- createdAt

### ModelReport
- id, taskModelId
- productFeedback
- verificationScreenshotUrls, verificationSummary
- overallScore, overallComment
- efficiencyScore, efficiencyComment
- qualityScore, qualityComment
- trajectoryAnalysis
- createdAt, updatedAt

### TaskMessage
- id, taskId, role, content, step, modelId
- createdAt

### ArtifactAnalysisRun
- id, taskModelId, status, currentPhase, workflowRunId
- verificationScreenshotUrls, verificationSummary
- filesAnalysis, nextEventSeq, error
- startedAt, completedAt, createdAt, updatedAt

### ArtifactAnalysisEvent
- id, runId, sequence, phase, status, label, detail, metadata
- createdAt

### EvaluationRubric（评分模板）
- id, taskId (1:1)
- templateType: CODING / AGENT / CUSTOM
- dimensionsJson: 评分维度数组（key/label/weight/description/scoreRange/commonDeductions）
- overallFormula: 综合分公式说明
- createdAt, updatedAt

### ModelReport（报告版本链，新增字段）
- **version**：版本号（自增，(taskModelId, version) 唯一）
- **source**：AI_GENERATED / AI_ADJUSTED / MANUAL
- **parentReportId**：上一版本（形成修订链，自引用外键）
- **editedById**：人工修订者 ID（外键 User，删用户置 NULL）
- **editNote**：修订说明
- **generationSnapshot**（@db.Text）：生成时元信息快照（AI 模型/token/耗时/产物签名/过程文本 hash）
- **generationConfig**（@db.Text）：生成时 rubric/prompt 配置快照

### TaskCollaborator（协作者）
- id, taskId, userId (taskId+userId 唯一)
- role: VIEWER / EDITOR
- createdAt

### TaskShare（公开只读链接）
- id, taskId, token (@unique, sh_ 前缀 + 32 位 base64url CSPRNG)
- accessType: VIEW
- expiresAt（可空，永久）
- createdById（外键 User，删用户级联删除）
- createdAt

### AuditLog
- id, userId, action, taskId, status, error, ip, userAgent, detail
- tokenInput, tokenOutput, durationMs
- createdAt（索引：userId/action/taskId/createdAt）

### RateLimitBucket
- id, scope, identifier, tokens, resetAt

### AuditLog
- id, userId, action, detail, ipAddress, userAgent
- path, method, status, error
- tokenInput, tokenOutput, durationMs
- taskId, createdAt

## 部署说明

### 环境变量
- DATABASE_URL：PostgreSQL pooled 连接（应用运行）
- DIRECT_URL：PostgreSQL 直连（Prisma 迁移，Neon 等服务需配置）
- SESSION_SECRET：会话加密密钥（32 字符以上）
- ENCRYPTION_KEY：API Key 加密密钥（32 字节，64 位十六进制）
- BLOB_READ_WRITE_TOKEN：Vercel Blob 令牌（可选，文件上传用；未配置时使用本地文件存储）
- ADMIN_USERNAME：初始管理员用户名
- ADMIN_PASSWORD：初始管理员密码
- DATABASE_URL：PostgreSQL 连接串（Neon pooled 连接）
- DIRECT_URL：PostgreSQL 直连串（Prisma 迁移用，Neon 必需）
- SESSION_SECRET：iron-session 加密密钥（≥32 字符）
- ENCRYPTION_KEY：AES-256-GCM 加密用户 API Key（推荐 64 位十六进制，用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成）

### Vercel 部署步骤
1. 连接 GitHub 仓库
2. 配置环境变量（见上表）
3. 配置 Build Command: `pnpm build`（会自动在 production 环境跑 `prisma migrate deploy`）
4. 配置 Install Command: `pnpm install`
5. 添加 Neon Postgres 集成
6. 首次部署后执行 `pnpm init:admin` 创建管理员账号
7. （可选）开启 Vercel Blob 存储以支持原始文件上传

## 后续规划
- 支持更多文件格式解析
- 报告跨模型对比可视化（雷达图/条形图）
- 历史趋势分析（同任务同模型多版本成绩对比）
- 任务模板库（预设场景化任务 prompt）
- 通知中心（协作者加入、报告生成完成提醒）
- 多语言支持
