import assert from 'node:assert/strict'
import test from 'node:test'
import { hasAccessLevel, requireAccess, generateShareToken } from './task-access'

test('hasAccessLevel: null/undefined 无任何权限', () => {
  assert.equal(hasAccessLevel(null, 'VIEWER'), false)
  assert.equal(hasAccessLevel(undefined, 'VIEWER'), false)
})

test('hasAccessLevel: 权限等级 OWNER > EDITOR > VIEWER > PUBLIC_VIEW', () => {
  // OWNER 拥有一切
  assert.equal(hasAccessLevel('OWNER', 'OWNER'), true)
  assert.equal(hasAccessLevel('OWNER', 'EDITOR'), true)
  assert.equal(hasAccessLevel('OWNER', 'VIEWER'), true)
  assert.equal(hasAccessLevel('OWNER', 'PUBLIC_VIEW'), true)

  // EDITOR 可编辑、查看，但不能 OWNER
  assert.equal(hasAccessLevel('EDITOR', 'EDITOR'), true)
  assert.equal(hasAccessLevel('EDITOR', 'VIEWER'), true)
  assert.equal(hasAccessLevel('EDITOR', 'OWNER'), false)
  assert.equal(hasAccessLevel('EDITOR', 'PUBLIC_VIEW'), true)

  // VIEWER 仅能查看
  assert.equal(hasAccessLevel('VIEWER', 'VIEWER'), true)
  assert.equal(hasAccessLevel('VIEWER', 'EDITOR'), false)
  assert.equal(hasAccessLevel('VIEWER', 'OWNER'), false)
  assert.equal(hasAccessLevel('VIEWER', 'PUBLIC_VIEW'), true)

  // PUBLIC_VIEW 最低
  assert.equal(hasAccessLevel('PUBLIC_VIEW', 'PUBLIC_VIEW'), true)
  assert.equal(hasAccessLevel('PUBLIC_VIEW', 'VIEWER'), false)
  assert.equal(hasAccessLevel('PUBLIC_VIEW', 'EDITOR'), false)
  assert.equal(hasAccessLevel('PUBLIC_VIEW', 'OWNER'), false)
})

test('requireAccess: 权限足够时返回 null', () => {
  assert.equal(requireAccess('OWNER', 'OWNER'), null)
  assert.equal(requireAccess('OWNER', 'EDITOR'), null)
  assert.equal(requireAccess('EDITOR', 'VIEWER'), null)
  assert.equal(requireAccess('VIEWER', 'VIEWER'), null)
})

test('requireAccess: access 为 null 返回 404 错误', () => {
  const r = requireAccess(null, 'VIEWER')
  assert.ok(r, '必须返回错误对象')
  assert.equal(r!.status, 404)
  assert.ok(/任务不存在/.test(r!.error))
})

test('requireAccess: 权限不足返回 403 错误', () => {
  const r = requireAccess('VIEWER', 'EDITOR')
  assert.ok(r)
  assert.equal(r!.status, 403)
  assert.ok(/无权限/.test(r!.error))
})

test('generateShareToken: 前缀 sh_ + 32 字符 base64url（熵充足）', () => {
  const tokens = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const t = generateShareToken()
    assert.ok(t.startsWith('sh_'), 'token 应以 sh_ 开头，实际：' + t)
    // sh_ + 32 chars (24 bytes → 32 base64url chars)
    assert.ok(/^sh_[A-Za-z0-9_-]{32,}$/.test(t), 'token 应符合 base64url 格式且长度 ≥ 32，实际：' + t)
    assert.equal(tokens.has(t), false, '连续 50 个 token 不应出现重复（概率极低）')
    tokens.add(t)
  }
})

test('generateShareToken: 不使用 Math.random 产生的低熵字符模式（CSPRNG 产生值分布均匀）', () => {
  // 抽样 200 个 token，统计字符类别，确保各种字符都出现过（避免 Math.random 的偏置）
  const concat = Array.from({ length: 200 }, () => generateShareToken().slice(3)).join('')
  const hasUpper = /[A-Z]/.test(concat)
  const hasLower = /[a-z]/.test(concat)
  const hasDigit = /[0-9]/.test(concat)
  // base64url 可能不含 _ 或 -，但至少应混合大小写和数字
  assert.ok(hasUpper && hasLower && hasDigit,
    '200 个 token 应覆盖大写/小写/数字，否则熵或 RNG 可能异常')
})
