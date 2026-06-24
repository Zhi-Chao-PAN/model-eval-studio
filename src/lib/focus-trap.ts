/**
 * Focus trap 用到的纯函数 helper。
 *
 * 与 useFocusTrap hook 分离的原因：
 * - 纯函数才能跑在 `tsx --test src/lib/*.test.ts` 既有测试体系里。
 * - DOM 接口足以用 duck-typing 在 Node 测试里模拟，不需要 jsdom。
 */

/**
 * 与 ConfirmDialog 内嵌实现保持一致的 focusable selector。
 * 显式枚举常见 form / button / link / tabbable 自定义元素。
 *
 * 注意：CSS selector 里的 `:not([tabindex="-1"])` 已经排除掉 tabindex=-1，但
 * disabled 状态需要二次过滤（在 getFocusableElements 里处理）。
 */
export const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * `HTMLElement` 在 Node 环境下不存在。为了让 helper 既能用在浏览器，又能单测，
 * 我们对 element 只读取一组最小接口。
 */
export interface FocusableLike {
  disabled?: unknown
  /** Element.closest，传入 selector 返回 ancestor 或 null。 */
  closest?: (selector: string) => unknown | null
  /** 实际 DOM 上还有 focus()，但 helper 自己不调用它，留给调用方。 */
}

/**
 * 给定容器内查到的元素清单，过滤出真正"可被 Tab 聚焦"的元素。
 *
 * 抽成纯函数的目的是单测——浏览器调用方先用 `container.querySelectorAll(FOCUSABLE_SELECTOR)`
 * 拿到 NodeList 再传进来。
 */
export function filterFocusable<T extends FocusableLike>(elements: readonly T[]): T[] {
  return elements.filter(el => {
    if (el.disabled === true) return false
    if (typeof el.closest === 'function') {
      if (el.closest('[aria-hidden="true"]')) return false
    }
    return true
  })
}

/**
 * 给定当前 focused 元素，根据 Tab 方向计算「下一个应该聚焦的元素」。
 * 返回 null 表示「保持浏览器默认行为，不阻止 Tab」（即焦点还能正常移动）。
 *
 * 规则：
 * - 没有 focusable → null（不拦截）
 * - Shift+Tab 且当前是第一个 / 不在列表内 → 返回最后一个（循环）
 * - Tab 且当前是最后一个 / 不在列表内 → 返回第一个（循环）
 * - 其它情况 → null（让浏览器自然处理）
 */
export function getNextFocusTarget<T>(
  focusable: readonly T[],
  current: T | null,
  shiftKey: boolean,
): T | null {
  if (focusable.length === 0) return null
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const idx = current ? focusable.indexOf(current) : -1
  if (shiftKey) {
    if (idx <= 0) return last
    return null
  }
  if (idx === -1 || idx === focusable.length - 1) return first
  return null
}
