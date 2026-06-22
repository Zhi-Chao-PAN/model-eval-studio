/**
 * Sanitize a backend error message before showing it in the UI.
 *
 *  - Strips excessive whitespace (newlines, repeated spaces) so a stray
 *    stack trace or JSON error blob doesn't blow up the toast / banner.
 *  - Truncates anything over the limit with an ellipsis.
 *  - Detects raw HTML bodies (Next.js dev error page, Vercel error page,
 *    etc.) and replaces them with a short hint instead of dumping markup.
 *
 * Pure function: safe to import from server, client, and unit tests.
 */
export const ANALYSIS_ERROR_MAX_LENGTH = 240
export const ANALYSIS_HTML_ERROR_HINT =
  '（提示：服务端返回了非预期内容，请打开浏览器开发者工具查看完整响应后重试）'

const HTML_PATTERN = /<\/?(html|body|head|!doctype)\b/i

export function clampAnalysisError(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return '未知错误'
  if (HTML_PATTERN.test(cleaned)) {
    return ANALYSIS_HTML_ERROR_HINT
  }
  if (cleaned.length <= ANALYSIS_ERROR_MAX_LENGTH) return cleaned
  return cleaned.slice(0, ANALYSIS_ERROR_MAX_LENGTH) + '…'
}