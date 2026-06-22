/**
 * 智能数据库迁移脚本：
 *
 * 场景 A：生产环境全新数据库（第一次部署）
 *   - _prisma_migrations 表不存在 → 执行 prisma db push（直接按 schema.prisma 同步表结构）
 *   - 然后把 prisma/migrations 目录下所有已存在的迁移标记为 applied（避免后续 migrate deploy 重复执行）
 *   - 最后执行 prisma migrate deploy（会应用未来新增的迁移）
 *
 * 场景 B：生产环境已有数据库（常规升级）
 *   - 直接执行 prisma migrate deploy，应用增量迁移
 *
 * 场景 C：非生产 / FORCE_MIGRATE=1
 *   - 同常规流程，但 Preview/dev 默认跳过
 *
 * 这样即使项目早期是用 db push 起步、后续才开启迁移历史，
 * 全新环境也能一次性初始化成功，不需要手工 baseline。
 */

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')

// 优先使用本地 node_modules/.bin/prisma
const localPrismaBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
)
let prismaBin = 'prisma'
if (fs.existsSync(localPrismaBin)) {
  prismaBin = '"' + localPrismaBin + '"'
}

const isProduction = process.env.VERCEL_ENV === 'production'
const isForced = process.env.FORCE_MIGRATE === '1'
const hasDbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL
const timeoutMs = Number(process.env.MIGRATE_TIMEOUT_MS) || 180_000

function run(cmd, opts = {}) {
  console.log('[migrate] $ ' + cmd)
  return execSync(cmd, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    timeout: timeoutMs,
    ...opts,
  })
}

function runCapture(cmd) {
  try {
    return execSync(cmd, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      timeout: 30_000,
    }).toString()
  } catch (err) {
    // 命令返回非零退出码时（如 `prisma migrate status` 有未应用迁移），
    // execSync 会抛错。我们仍然需要它的 stdout/stderr 来做后续判断，
    // 否则会把"有待应用迁移"误判成"全新数据库"。
    const stdout = err && err.stdout ? err.stdout.toString() : ''
    const stderr = err && err.stderr ? err.stderr.toString() : ''
    const combined = stdout + stderr
    return combined.length > 0 ? combined : null
  }
}

if (!(isProduction || isForced)) {
  console.log(
    '[migrate] 非生产环境（VERCEL_ENV=' +
      (process.env.VERCEL_ENV || 'development') +
      '），跳过迁移。设置 FORCE_MIGRATE=1 可强制执行。'
  )
  process.exit(0)
}

if (!hasDbUrl) {
  console.warn('[migrate] ⚠️  未检测到 DATABASE_URL / DIRECT_URL，跳过迁移')
  process.exit(0)
}

// 检测是否是全新数据库（没有 _prisma_migrations 表，或表为空）
function isFreshDatabase() {
  // 使用 prisma 执行一个简单查询检查 _prisma_migrations 表是否存在且有记录
  // 通过 prisma migrate status 来判断：如果返回 "Database not yet in sync" 或 similar 模式
  const out = runCapture(prismaBin + ' migrate status --schema prisma/schema.prisma')
  if (out == null) {
    // 命令完全失败且没任何输出 → 可能是网络/权限问题，保守不当作 fresh
    console.log('[migrate] ⚠️  migrate status 无输出，保守判定为非全新（走 migrate deploy）')
    return false
  }
  // 已有迁移历史 / schema 已同步 → 不是 fresh
  if (/database schema is up to date/i.test(out) || /already in sync/i.test(out)) {
    return false
  }
  // 有迁移历史但需要应用新迁移 → 不是 fresh
  if (/migrations? have not yet been applied/i.test(out) || /following migrations? have not yet been applied/i.test(out)) {
    return false
  }
  // 数据库本身不存在 / _prisma_migrations 表不存在 / 没任何迁移应用过 → fresh
  if (/P1001|P1003|relation "_prisma_migrations" does not exist|no migration found in/i.test(out) || /no migrations have been applied/i.test(out)) {
    return true
  }
  // 其他未知情况：打印输出供排查，默认 **不当作 fresh**，由 migrate deploy 决定
  console.log('[migrate] ⚠️  无法明确判定数据库状态，按非全新处理。migrate status 输出（前 800 字符）:')
  console.log(out.slice(0, 800))
  return false
}

try {
  if (isFreshDatabase()) {
    console.log('[migrate] 🆕 检测到全新数据库，执行 prisma db push 初始化 schema')
    run(prismaBin + ' db push --skip-generate --accept-data-loss')
    console.log('[migrate] ✅ schema 初始化完成')

    // 把已存在的迁移标记为已应用（migrate resolve 标记为 applied）
    // prisma migrate resolve --applied <migration_name> 对每个已存在的迁移执行
    const migrationsDir = path.join(projectRoot, 'prisma', 'migrations')
    if (fs.existsSync(migrationsDir)) {
      const names = fs
        .readdirSync(migrationsDir)
        .filter(n => {
          const p = path.join(migrationsDir, n)
          return (
            fs.statSync(p).isDirectory() &&
            fs.existsSync(path.join(p, 'migration.sql'))
          )
        })
        .sort()
      for (const name of names) {
        console.log('[migrate] 标记基线迁移 ' + name + ' 为已应用')
        try {
          run(prismaBin + ' migrate resolve --applied ' + name, { stdio: 'pipe' })
        } catch (e) {
          // 如果迁移已经被标记为 applied（因刚才 db push 已包含），会报错，这是预期的
          console.log('[migrate]   （跳过，可能已标记）')
        }
      }
    }
  }

  // 再跑一次 migrate deploy，应用任何新增/未执行的迁移（幂等）
  console.log('[migrate] 🚀 执行 prisma migrate deploy')
  run(prismaBin + ' migrate deploy')
  console.log('[migrate] ✅ 数据库迁移完成')
} catch (err) {
  console.error('[migrate] ❌ 数据库迁移失败')
  if (err && err.stderr) {
    try { console.error(err.stderr.toString()) } catch (_) {}
  }
  if (err && err.stdout) {
    try { console.error(err.stdout.toString()) } catch (_) {}
  }
  if (err && err.killed) {
    console.error('[migrate] 迁移超时被终止（timeout=' + timeoutMs + 'ms），可通过 MIGRATE_TIMEOUT_MS 调整')
  }
  process.exit(1)
}
