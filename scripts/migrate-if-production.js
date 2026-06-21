/**
 * 条件执行 Prisma 数据库迁移。
 *
 * 规则：
 * - 生产环境（VERCEL_ENV === 'production'）：执行 prisma migrate deploy
 * - Preview / 开发环境：跳过迁移，打印提示
 * - 设置 FORCE_MIGRATE=1 可强制执行（例如本地需要跑迁移时）
 *
 * 目的：防止 Preview Deployment 误改生产数据库。
 */

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')

// 优先使用本地 node_modules/.bin/prisma，避免 npx 临时下载/版本不一致
const localPrismaBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma')
const prismaBin = fs.existsSync(localPrismaBin)
  ? localPrismaBin
  : 'prisma' // fallback: 期望 PATH 中有 prisma（pnpm exec/全局安装）

const isProduction = process.env.VERCEL_ENV === 'production'
const isForced = process.env.FORCE_MIGRATE === '1'
const hasDbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL

if (isForced) {
  console.log('[migrate] FORCE_MIGRATE=1，强制执行数据库迁移')
} else if (isProduction) {
  console.log('[migrate] 检测到生产环境，执行数据库迁移')
} else {
  console.log(
    '[migrate] 非生产环境（VERCEL_ENV=' +
    (process.env.VERCEL_ENV || 'development') +
    '），跳过数据库迁移。'
  )
  console.log('[migrate] 如需本地手动迁移，请运行: pnpm db:migrate:deploy')
  console.log('[migrate] 或设置 FORCE_MIGRATE=1 强制执行')
  process.exit(0)
}

if (!hasDbUrl) {
  console.warn('[migrate] ⚠️  未检测到 DATABASE_URL / DIRECT_URL，跳过迁移')
  process.exit(0)
}

const timeoutMs = Number(process.env.MIGRATE_TIMEOUT_MS) || 120_000

try {
  execSync('"' + prismaBin + '" migrate deploy', {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    timeout: timeoutMs,
  })
  console.log('[migrate] ✅ 数据库迁移完成')
} catch (err) {
  console.error('[migrate] ❌ 数据库迁移失败')
  if (err && err.stderr) {
    // 把 stderr 打出来方便排查
    console.error('[migrate] stderr:')
    try { console.error(err.stderr.toString()) } catch (_) { /* ignore */ }
  }
  if (err && err.stdout) {
    try { console.error(err.stdout.toString()) } catch (_) { /* ignore */ }
  }
  if (err && err.killed) {
    console.error('[migrate] 迁移进程超时被终止（timeout=' + timeoutMs + 'ms），可通过 MIGRATE_TIMEOUT_MS 调整')
  }
  process.exit(1)
}
