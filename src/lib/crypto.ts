import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const ENCODING = 'base64'

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须配置至少 32 个字符的 ENCRYPTION_KEY')
    }
    return Buffer.from('dev-key-please-set-ENCRYPTION_KEY-in-prod-32', 'utf-8').subarray(0, 32)
  }
  return Buffer.from(key.slice(0, 32), 'utf-8')
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
