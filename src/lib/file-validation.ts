/**
 * Shared filename and MIME type validation utilities.
 *
 * Mirrors and consolidates the rules that were originally applied inline in
 * the artifact upload route so that other subsystems (ZIP entry names, future
 * upload endpoints, import tools) can apply the same guards.
 */

export const MAX_FILENAME_LENGTH = 180

/**
 * Extensions that are blocked because they represent compiled executable /
 * installer / active-content files that could cause harm if downloaded and
 * launched by a user.
 *
 * Source code / script artifacts (.js, .py, .sh, .ps1, .bat, .cmd, .html,
 * .css, etc.) are intentionally NOT on this list — those are evaluation
 * subjects served with Content-Disposition: attachment and are not
 * auto-executed by browsers or operating systems based solely on extension.
 */
export const BLOCKED_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows PE / installers / active content
  'exe', 'msi', 'msix', 'msp', 'mst', 'com', 'scr', 'pif', 'dll', 'sys',
  'drv', 'ocx', 'cpl', 'hta',
  // Windows scripting hosts (wscript/cscript execute these directly)
  'vbs', 'vbe', 'wsf', 'wsh',
  // Shortcut / link files that invoke arbitrary commands
  'lnk', 'scf',
  // macOS / *nix binary/installer formats
  'app', 'dmg', 'pkg', 'so', 'dylib', 'deb', 'rpm', 'bin', 'run',
  // Mobile / Java / WASM binary executables
  'apk', 'jar', 'wasm',
])

/**
 * Reasonably strict MIME type syntax: type/subtype with optional key=value
 * parameters. Rejects control characters, whitespace inside tokens, and
 * overlong values.
 */
const MIME_TYPE_RE =
  /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:\s*;\s*[a-zA-Z0-9!#$&^_.+-]+=(?:"[^"]*"|[^\s;]+))*$/

// Global flag: must replace ALL control characters, not just the first
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g

function getFileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() || name
  const dot = base.lastIndexOf('.')
  if (dot < 0 || dot === base.length - 1) return ''
  const ext = base.slice(dot + 1).toLowerCase()
  if (ext.length < 1 || ext.length > 10) return ''
  return ext
}

function truncatePreservingExtension(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  const ext = getFileExtension(name)
  if (!ext) return name.slice(0, maxLen)
  const maxBase = maxLen - ext.length - 1
  if (maxBase < 1) return name.slice(0, maxLen)
  return name.slice(0, maxBase) + '.' + ext
}

/**
 * Normalize and sanitize a user-supplied filename for safe storage/display.
 *
 * - NFKC unicode normalization (decomposes look-alikes)
 * - strips null bytes and C0 control characters (global)
 * - replaces path separators (/ and \) with dashes
 * - collapses runs of whitespace / dashes
 * - strips leading dots (hidden files) and leading/trailing dashes
 * - caps length at MAX_FILENAME_LENGTH (preserving extension when possible)
 *
 * Never throws; falls back to `fallback` if the input is empty or unsafe.
 */
export function sanitizeFileName(raw: unknown, fallback = 'file'): string {
  if (typeof raw !== 'string' || !raw) return fallback
  let name = raw
    .normalize('NFKC')
    .replace(CONTROL_CHARS_RE, '')
    .replace(/[\\/]+/g, '-')
    .trim()
  name = name.replace(/\s+/g, ' ').replace(/-{2,}/g, '-')
  // Strip leading dots (hidden files on POSIX) and leading/trailing dashes
  name = name.replace(/^\.+/, '').replace(/^-+|-+$/g, '')
  if (!name) return fallback
  name = truncatePreservingExtension(name, MAX_FILENAME_LENGTH)
  return name || fallback
}

/**
 * Validate a sanitized filename. Returns an error message string if invalid,
 * or null on success.
 *
 * Checks:
 *  - non-empty
 *  - length <= MAX_FILENAME_LENGTH
 *  - final extension not in BLOCKED_FILE_EXTENSIONS (defends against double
 *    extensions such as "report.pdf.exe")
 */
export function validateFileName(name: string): string | null {
  if (!name || typeof name !== 'string') return '文件名不能为空'
  if (name.length > MAX_FILENAME_LENGTH) {
    return `文件名不能超过 ${MAX_FILENAME_LENGTH} 个字符`
  }
  const ext = getFileExtension(name)
  if (ext && BLOCKED_FILE_EXTENSIONS.has(ext)) {
    return `不允许上传可执行文件类型（.${ext}）`
  }
  return null
}

/**
 * Validate a Content-Type / MIME type string (as declared by the client).
 * Returns an error message string if invalid, or null on success.
 *
 * Empty string is accepted (caller should treat it as "unknown").
 */
export function validateMimeType(mime: string): string | null {
  if (!mime) return null
  if (mime.length > 120) return 'MIME 类型过长'
  // Non-global regex here (.test() advances lastIndex on global regexes)
  if (/[\x00-\x1f\x7f]/.test(mime)) return 'MIME 类型含非法字符'
  if (!MIME_TYPE_RE.test(mime.trim())) return 'MIME 类型格式不合法'
  return null
}
