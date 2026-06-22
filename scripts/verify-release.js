#!/usr/bin/env node
/**
 * Release verification script.
 *
 * 依次执行 release 前必跑的三项检查：
 *   1. pnpm test        （lib 单测：解析 / 评分 / 限流 / 证据链 / 自动 runner / 提交版导出 等）
 *   2. pnpm typecheck   （tsc --noEmit；任何业务文件类型问题必须暴露）
 *   3. pnpm build       （Next.js 生产构建；路由 / 静态资源 / Prisma generate 全链路）
 *
 * 行为约定：
 *   - 不引入新依赖（仅使用 Node 内置 child_process + 包管理器分发）。
 *   - 任一阶段失败立即以非 0 退出，后续阶段不再继续。
 *   - 输出清晰阶段日志：阶段名 / 起始时间 / 退出码 / 耗时。
 *   - 可被 `pnpm verify:release` 调用，也可直接 `node scripts/verify-release.js`。
 *   - 跨平台：检测当前平台下的 pnpm / npm fallback。
 */

const { spawnSync } = require('node:child_process')

const STEPS = [
  { name: 'unit-tests', label: '运行单测（pnpm test）', command: 'test', args: [] },
  { name: 'typecheck', label: '运行类型检查（pnpm typecheck）', command: 'typecheck', args: [] },
  { name: 'build', label: '运行生产构建（pnpm build）', command: 'build', args: [] },
]

function detectPackageRunner() {
  // pnpm 优先；不可用时回退到 npm。
  // Windows 上 npm/pnpm 通常是 .cmd；不加后缀 spawnSync 会 ENOENT。
  const candidates = process.platform === 'win32'
    ? [
        { runner: 'pnpm', runArgs: cmd => ['run', cmd] },
        { runner: 'pnpm.cmd', runArgs: cmd => ['run', cmd] },
        { runner: 'npm', runArgs: cmd => ['run', cmd] },
        { runner: 'npm.cmd', runArgs: cmd => ['run', cmd] },
      ]
    : [
        { runner: 'pnpm', runArgs: cmd => ['run', cmd] },
        { runner: 'npm', runArgs: cmd => ['run', cmd] },
      ]
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.runner, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    })
    if (probe.error == null && probe.stdout && /\d/.test(probe.stdout)) {
      return candidate
    }
  }
  throw new Error('未能定位 pnpm 或 npm；请确保任一已安装并加入 PATH')
}

function pad(value, width) {
  const text = String(value)
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.round(ms / 100) / 10
  return `${totalSeconds}s`
}

let hasFailure = false

function runStep(step, runner) {
  const startedAt = Date.now()
  console.log('')
  console.log('━'.repeat(60))
  console.log(`▶ ${step.label}`)
  console.log(`  runner=${runner.runner}  start=${new Date(startedAt).toLocaleString()}`)
  console.log('━'.repeat(60))

  const args = ['--silent', ...runner.runArgs(step.command), ...step.args]
  const result = spawnSync(runner.runner, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    shell: process.platform === 'win32',
  })
  const elapsed = Date.now() - startedAt
  const exitCode = result.status ?? -1
  console.log('')
  console.log(`  exit=${exitCode}  elapsed=${formatDuration(elapsed)}`)

  if (exitCode !== 0) {
    console.log(`✖ ${step.name} 失败（exit=${exitCode}），立即停止后续阶段`)
    hasFailure = true
    return false
  }
  console.log(`✓ ${step.name} 通过`)
  return true
}

function main() {
  const overallStart = Date.now()
  console.log('Release verification started')
  console.log(`cwd=${process.cwd()}`)
  console.log(`node=${process.version}`)
  console.log(`platform=${process.platform} ${process.arch}`)

  const runner = detectPackageRunner()

  for (const step of STEPS) {
    const ok = runStep(step, runner)
    if (!ok) break
  }

  const totalElapsed = Date.now() - overallStart
  console.log('')
  console.log('━'.repeat(60))
  if (hasFailure) {
    console.log(`✖ Release verification FAILED in ${formatDuration(totalElapsed)}`)
    console.log('━'.repeat(60))
    process.exit(1)
  }
  console.log(`✓ Release verification PASSED in ${formatDuration(totalElapsed)}`)
  console.log('━'.repeat(60))
  process.exit(0)
}

main()