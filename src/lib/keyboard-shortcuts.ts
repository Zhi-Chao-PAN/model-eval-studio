/**
 * 键盘快捷键共享 helper。
 *
 * 设计原则：
 * - 纯函数，无 DOM 副作用以外的状态，方便单测。
 * - 所有 helper 都假设事件已经经过类型守卫（KeyboardEvent / EventTarget）。
 * - 不直接依赖 React，避免组件级 import 链。
 */

/**
 * 判断当前事件 target 是否是一个"用户正在打字"的元素。
 * 在这些元素上不应该触发全局快捷键，避免吞掉用户输入。
 *
 * 实现刻意采用 duck-typing（读 `tagName` / `isContentEditable`），不依赖
 * `instanceof Element` / `instanceof HTMLElement`——这样在没有 DOM 的运行时
 * （例如 Node 单测）也能直接传 plain object 验证。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown }
  const tag = typeof el.tagName === 'string' ? el.tagName : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable === true) return true
  return false
}

/**
 * 判断一个 KeyboardEvent 是否匹配「无修饰键的指定字符按下」。
 *
 * - Meta / Ctrl / Alt 按下都视为不匹配，避免误吞系统快捷键。
 * - Shift 不参与匹配（`?` 在大多数键盘布局上需要 Shift+/，但浏览器会把 e.key 直接给成 `?`）。
 */
export function matchShortcut(e: KeyboardEvent, key: string): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  return e.key === key
}

/**
 * 在一个 steps 数组里，按方向取下一个 step 的 key。
 * - direction = 1 表示往后；-1 表示往前。
 * - 越界返回 null（不循环、不自动回到首尾，调用方决定是否提示）。
 */
export function nextStepKey<T extends { key: string }>(
  steps: readonly T[],
  current: string,
  direction: 1 | -1,
): string | null {
  if (!steps || steps.length === 0) return null
  const idx = steps.findIndex(s => s.key === current)
  if (idx < 0) return null
  const next = idx + direction
  if (next < 0 || next >= steps.length) return null
  return steps[next].key
}

/**
 * 简单的"g 前缀双键"识别器。
 *
 * 用法：在 keydown handler 里维护一个 `gPrefixAt: number | null`，
 * 调用 `consumeGPrefix(e, gPrefixAt)` 拿到 { matched, nextPrefixAt }。
 *
 * 规则：
 * - 第一次按 `g`（且不在打字 target）→ 进入 prefix 等待，返回 { matched: null, nextPrefixAt: now }。
 * - prefix 后 1500ms 内按 `key`（如 `d`、`s`）→ 返回 { matched: key, nextPrefixAt: null }。
 * - 任意其它键、超时、按下修饰键 → 清空 prefix。
 */
export function consumeGPrefix(
  e: KeyboardEvent,
  prefixAt: number | null,
  now: number = Date.now(),
  timeoutMs: number = 1500,
): { matched: string | null; nextPrefixAt: number | null; isPrefixStart: boolean } {
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return { matched: null, nextPrefixAt: null, isPrefixStart: false }
  }
  if (isTypingTarget(e.target)) {
    return { matched: null, nextPrefixAt: null, isPrefixStart: false }
  }
  // 起点：按下 g
  if (e.key === 'g' || e.key === 'G') {
    return { matched: null, nextPrefixAt: now, isPrefixStart: true }
  }
  // 已经在 prefix 状态，且没超时
  if (prefixAt !== null && now - prefixAt <= timeoutMs) {
    // 任意单字母都视为消费 prefix
    return { matched: e.key.toLowerCase(), nextPrefixAt: null, isPrefixStart: false }
  }
  // 不在 prefix 状态 / 超时 → 啥都不做
  return { matched: null, nextPrefixAt: null, isPrefixStart: false }
}
