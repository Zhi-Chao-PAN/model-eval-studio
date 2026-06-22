import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_FILENAME_LENGTH,
  BLOCKED_FILE_EXTENSIONS,
  sanitizeFileName,
  validateFileName,
  validateMimeType,
} from './file-validation'

describe('sanitizeFileName', () => {
  it('returns fallback for null/undefined/empty', () => {
    assert.equal(sanitizeFileName(null), 'file')
    assert.equal(sanitizeFileName(undefined, 'fb'), 'fb')
    assert.equal(sanitizeFileName('', 'fb'), 'fb')
    assert.equal(sanitizeFileName(123 as any, 'fb'), 'fb')
  })

  it('strips control characters (C0 + DEL)', () => {
    assert.equal(sanitizeFileName('report\x00.pdf'), 'report.pdf')
    assert.equal(sanitizeFileName('bad\x01\x02name.txt'), 'badname.txt')
    assert.equal(sanitizeFileName('a\x7fb'), 'ab')
  })

  it('replaces path separators with dashes', () => {
    assert.equal(sanitizeFileName('a/b/c.txt'), 'a-b-c.txt')
    assert.equal(sanitizeFileName('a\\b\\c.txt'), 'a-b-c.txt')
    assert.equal(sanitizeFileName('/etc/passwd'), 'etc-passwd')
  })

  it('collapses runs of dashes and spaces', () => {
    assert.equal(sanitizeFileName('hello---world.txt'), 'hello-world.txt')
    assert.equal(sanitizeFileName('a   b   c.md'), 'a b c.md')
  })

  it('strips leading dots (no hidden files)', () => {
    assert.equal(sanitizeFileName('.env'), 'env')
    assert.equal(sanitizeFileName('...hidden'), 'hidden')
  })

  it('NFKC normalizes fullwidth characters', () => {
    // fullwidth "Ａ" (U+FF21) normalizes to ASCII "A"
    assert.equal(sanitizeFileName('ｒｅｐｏｒｔ.pdf'), 'report.pdf')
  })

  it('truncates overlong names to MAX_FILENAME_LENGTH', () => {
    const long = 'a'.repeat(500) + '.txt'
    const result = sanitizeFileName(long)
    assert.ok(result.length <= MAX_FILENAME_LENGTH)
    assert.ok(result.endsWith('.txt'))
  })

  it('preserves normal ASCII names unchanged', () => {
    assert.equal(sanitizeFileName('model-report-v2.pdf'), 'model-report-v2.pdf')
    assert.equal(sanitizeFileName('src.main.py'), 'src.main.py')
  })
})

describe('validateFileName', () => {
  it('rejects empty / non-string', () => {
    assert.ok(validateFileName(''))
    assert.ok(validateFileName(null as any))
  })

  it('rejects names longer than MAX_FILENAME_LENGTH', () => {
    const long = 'a'.repeat(MAX_FILENAME_LENGTH + 1)
    assert.ok(validateFileName(long))
  })

  it('accepts names equal to MAX_FILENAME_LENGTH', () => {
    const exact = 'a'.repeat(MAX_FILENAME_LENGTH)
    assert.equal(validateFileName(exact), null)
  })

  it('blocks known executable extensions', () => {
    for (const ext of ['exe', 'msi', 'dll', 'scr', 'hta', 'vbs', 'apk', 'jar', 'app', 'dmg', 'so', 'wasm', 'lnk']) {
      const err = validateFileName(`report.${ext}`)
      assert.ok(err, `expected .${ext} to be blocked`)
    }
  })

  it('blocks double-extension attacks (e.g. report.pdf.exe)', () => {
    const err = validateFileName('report.pdf.exe')
    assert.ok(err)
    assert.match(err!, /\.exe/)
  })

  it('allows common document / source code extensions', () => {
    for (const ext of ['pdf', 'docx', 'txt', 'md', 'zip', 'png', 'jpg', 'py', 'js', 'ts', 'sh', 'ps1', 'bat', 'cmd', 'html']) {
      assert.equal(validateFileName(`artifact.${ext}`), null, `.${ext} should be allowed`)
    }
  })

  it('allows extension-less names', () => {
    assert.equal(validateFileName('Makefile'), null)
    assert.equal(validateFileName('Dockerfile'), null)
  })

  it('BLOCKED_FILE_EXTENSIONS covers the expected base set', () => {
    // sanity-check the set has a reasonable size and is a Set instance
    assert.ok(BLOCKED_FILE_EXTENSIONS.size >= 20)
    assert.ok(BLOCKED_FILE_EXTENSIONS.has('exe'))
    assert.ok(BLOCKED_FILE_EXTENSIONS.has('msi'))
  })
})

describe('validateMimeType', () => {
  it('accepts empty string (unknown)', () => {
    assert.equal(validateMimeType(''), null)
  })

  it('accepts common simple MIME types', () => {
    assert.equal(validateMimeType('text/plain'), null)
    assert.equal(validateMimeType('application/pdf'), null)
    assert.equal(validateMimeType('image/png'), null)
    assert.equal(validateMimeType('application/zip'), null)
    assert.equal(validateMimeType('application/octet-stream'), null)
  })

  it('accepts MIME types with charset parameter', () => {
    assert.equal(validateMimeType('text/html; charset=utf-8'), null)
    assert.equal(validateMimeType('text/plain; charset="UTF-8"'), null)
  })

  it('rejects MIME with control characters', () => {
    assert.ok(validateMimeType('text/plain\x00'))
    assert.ok(validateMimeType('image/png\x0a'))
  })

  it('rejects overlong MIME strings', () => {
    assert.ok(validateMimeType('x/' + 'a'.repeat(200)))
  })

  it('rejects malformed MIME strings', () => {
    assert.ok(validateMimeType('not a mime'))
    assert.ok(validateMimeType('/pdf'))
    assert.ok(validateMimeType('text/'))
  })
})
