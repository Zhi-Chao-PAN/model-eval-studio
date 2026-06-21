import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { encrypt, decrypt } from './crypto'

// Set before any encrypt/decrypt call. getKey() reads process.env at invocation time
// (not at module load time), so static import is fine.
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex')

test('encrypt/decrypt round-trip: ASCII 文本', () => {
  const plain = 'hello world 123 !@#$'
  const ct = encrypt(plain)
  assert.notEqual(ct, plain)
  assert.match(ct, /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/, '应是 iv:tag:data base64 格式')
  assert.equal(decrypt(ct), plain)
})

test('encrypt/decrypt round-trip: 中文 & emoji & 长文本', () => {
  const plain = '你好，世界 🌍🚀' + 'x'.repeat(10_000)
  const ct = encrypt(plain)
  assert.equal(decrypt(ct), plain)
})

test('encrypt/decrypt round-trip: 空串', () => {
  const ct = encrypt('')
  assert.equal(decrypt(ct), '')
})

test('encrypt: 每次加密产生不同密文（随机 IV）', () => {
  const ct1 = encrypt('same plaintext')
  const ct2 = encrypt('same plaintext')
  assert.notEqual(ct1, ct2, '两次加密 IV 不同，密文必须不同')
  assert.equal(decrypt(ct1), 'same plaintext')
  assert.equal(decrypt(ct2), 'same plaintext')
})

test('decrypt: 篡改密文抛出认证错误', () => {
  const ct = encrypt('secret')
  const parts = ct.split(':')
  // 翻转最后一个字符
  const lastChar = parts[2].slice(-1)
  const flipped = lastChar === 'A' ? 'B' : 'A'
  parts[2] = parts[2].slice(0, -1) + flipped
  assert.throws(() => decrypt(parts.join(':')), /auth|bad|invalid|decrypt|fail|gcm|tag/i)
})

test('decrypt: 非法格式抛出', () => {
  assert.throws(() => decrypt('not-a-valid-ciphertext'))
  assert.throws(() => decrypt(''))
  assert.throws(() => decrypt('only:one'))
})

test('hex 64 字符 key: 多次 encrypt/decrypt 往返成功', () => {
  for (let i = 0; i < 5; i++) {
    const msg = 'msg-' + i
    assert.equal(decrypt(encrypt(msg)), msg)
  }
})
