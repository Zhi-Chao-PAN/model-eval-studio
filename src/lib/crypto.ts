import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const ENCODING = 'base64'
const KEY_BYTES = 32 // AES-256

/**
 * Derive a 32-byte AES key from ENCRYPTION_KEY.
 *
 * 支持两种格式：
 *   1. 64 位十六进制字符串（推荐）：使用 crypto.randomBytes(32).toString('hex') 生成，按 hex 解码为 32 字节。
 *   2. 任意 >=32 字符的字符串：按 UTF-8 取前 32 字节（向后兼容）。
 * 生产环境若未设置或长度不足会抛错；开发环境使用内置占位 key（数据不可在生产解密，但本地可用）。
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须配置 ENCRYPTION_KEY（推荐 64 位十六进制随机字符串，可用 node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" 生成）')
    }
    return Buffer.from('dev-key-please-set-ENCRYPTION_KEY-in-prod-32', 'utf-8').subarray(0, KEY_BYTES)
  }
  // 64 hex chars → decode as hex for full-entropy 32-byte key
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    return Buffer.from(raw.trim(), 'hex')
  }
  const utf8 = Buffer.from(raw, 'utf-8')
  if (utf8.length < KEY_BYTES) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY 长度不足：需要 64 位十六进制或至少 32 个字符的字符串')
    }
    // dev 环境不足长度时用占位 key，避免本地启动失败
    return Buffer.from('dev-key-please-set-ENCRYPTION_KEY-in-prod-32', 'utf-8').subarray(0, KEY_BYTES)
  }
  return utf8.subarray(0, KEY_BYTES)
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv:tag:data
  return [iv.toString(ENCODING), tag.toString(ENCODING), encrypted.toString(ENCODING)].join(':')
}

export function decrypt(ciphertext: string): string {
  const [ivStr, tagStr, dataStr] = ciphertext.split(':')
  if (!ivStr || !tagStr || !dataStr) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivStr, ENCODING)
  const tag = Buffer.from(tagStr, ENCODING)
  const data = Buffer.from(dataStr, ENCODING)
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8')
}
