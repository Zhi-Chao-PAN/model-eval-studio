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

const { execSync } = require('child_process')

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

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  })
  console.log('[migrate] ✅ 数据库迁移完成')
} catch (err) {
  console.error('[migrate] ❌ 数据库迁移失败')
  process.exit(1)
}
