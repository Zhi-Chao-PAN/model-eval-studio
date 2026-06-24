'use client'
import { useEffect, useRef, type RefObject } from 'react'
import {
  FOCUSABLE_SELECTOR,
  filterFocusable,
  getNextFocusTarget,
} from '@/lib/focus-trap'

interface UseFocusTrapOptions {
  /** 是否启用 trap。常为 open state。 */
  enabled: boolean
  /** 容器元素 ref（一般是 modal panel）。 */
  containerRef: RefObject<HTMLElement | null>
  /** 自定义"初始焦点"目标 ref；不传则用容器内第一个可聚焦元素。 */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** 打开时延迟多少 ms 把焦点移入容器内（给动画留时间）。默认 20。 */
  initialFocusDelay?: number
  /** 是否锁 body 滚动。默认 true。 */
  lockBodyScroll?: boolean
  /** 关闭时是否还原焦点到打开前的元素。默认 true。 */
  returnFocus?: boolean
}

/**
 * 通用 focus trap hook。
 *
 * 行为契约：
 * 1. enabled 翻转为 true：
 *    - 记录当前 `document.activeElement` 作为 trigger
 *    - 延迟 `initialFocusDelay` ms 把焦点移入容器（或 initialFocusRef）
 *    - 锁 body 滚动
 *    - 监听 document keydown，Tab/Shift+Tab 在容器内循环
 * 2. enabled 翻转为 false 或组件卸载：
 *    - 解锁 body 滚动
 *    - 还原焦点到 trigger（如果可还原）
 *    - 解绑 keydown
 *
 * 不处理 Escape——调用方按业务决定 Escape 行为；trap 只管 Tab。
 *
 * 纯计算部分在 `@/lib/focus-trap`（已有单测），这里只负责 React 生命周期编排。
 */
export function useFocusTrap({
  enabled,
  containerRef,
  initialFocusRef,
  initialFocusDelay = 20,
  lockBodyScroll = true,
  returnFocus = true,
}: UseFocusTrapOptions) {
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    // 记录 trigger 以便关闭时还原焦点
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null

    // 初始焦点
    const timer = window.setTimeout(() => {
      const fallback = containerRef.current
        ? filterFocusable(
            Array.from(
              containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ),
          )[0]
        : undefined
      const target = initialFocusRef?.current ?? fallback ?? null
      target?.focus()
    }, initialFocusDelay)

    // 锁滚动
    const prevOverflow = document.body.style.overflow
    if (lockBodyScroll) document.body.style.overflow = 'hidden'

    // Tab 循环
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusable = filterFocusable(
        Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)),
      )
      const next = getNextFocusTarget(
        focusable,
        document.activeElement as HTMLElement | null,
        e.shiftKey,
      )
      if (next) {
        e.preventDefault()
        next.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      if (lockBodyScroll) document.body.style.overflow = prevOverflow
      if (returnFocus) {
        // 防止还原到已卸载的元素
        const trigger = triggerRef.current
        if (trigger && document.contains(trigger)) {
          trigger.focus()
        }
      }
    }
  // 故意只依赖 enabled——ref 引用稳定，数值 option 变化不应重置 trap
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
