# 凭据使用与提交保护

应用仍通过原有的用户 AI 设置读取密钥；本次安全调整不更换数据库、会话密钥、用户配置或生产环境变量。

`scripts/test-ai.js` 是独立手动测试脚本。它只从服务端环境变量 `MINIMAX_API_KEY` 取值，未设置时会在发请求前退出。可在被 Git 忽略的 `.env.local` 中自行配置，然后运行 `node --env-file=.env.local scripts/test-ai.js`。该命令会真实调用模型并消耗额度，不属于测试套件。不要使用 `NEXT_PUBLIC_` 前缀、把完整 key 写进命令记录或打印认证请求头。

安装 Gitleaks 8.30.1 或更高版本（macOS 可用 `brew install gitleaks`），再执行：

```sh
pnpm security:install-hooks
pnpm security:scan
```

本机 `pnpm install` 的 prepare 阶段也会配置本仓库的 hooks；CI、Vercel、无 Git 目录或已有自定义 hooksPath 时保持现状。已有 hooks 的用户应将 `.githooks/` 中两个检查接入自己的流程，避免覆盖原有检查。

- 提交前扫描 Git 暂存区，拦截实际准备提交的凭据与敏感配置文件。
- 推送前扫描全部本地可达历史，降低旧分支再次带回泄露值的风险。
- GitHub Actions 独立扫描完整获取的历史。Gitleaks 保留默认规则，并补充 MiniMax 订阅 key 规则；日志全量遮盖密钥。
- `.env.example` 仅保留空值或明确占位说明。真实 `.env*`、私钥与认证导出不入库。不要复制包含凭据的审计包或旧 `.git` 回项目。

Git hooks 可以被手动绕过，CI 检查也不能阻止已经发生的公开推送。GitHub 通用 Secret Scanning / Push Protection 继续保留；不能保证平台识别每家厂商的所有密钥格式。

## 历史净化后的旧克隆

2026-11-10 对已泄露 MiniMax key 做了历史净化，提交 SHA 会变化。其他机器重新克隆最稳妥；有未提交工作时先私下保存补丁，扫描后基于干净历史重放。不要把旧历史 merge 或 force-push 回远端。受保护的恢复 bundle 仅用于本机取证和定向恢复，不得上传。

GitHub 的旧提交缓存及 PR 特殊引用由平台管理，普通分支改写不能保证清除它们。密钥撤销是必要处置；若仍能按旧 SHA 读取，应按 GitHub 官方流程申请平台清理。
