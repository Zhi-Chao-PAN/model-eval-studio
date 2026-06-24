'use client'
import { useEffect, useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { isTypingTarget } from '@/lib/keyboard-shortcuts'

/**
 * 一条键盘快捷键的展示模型。
 * - `keys`：按显示顺序排列的按键标签（数组允许双键组合，例如 `['G', 'D']` 展示为「G、D 两个 kbd」）。
 * - `label`：人类可读的描述。
 */
export interface ShortcutItem {
  keys: string[]
  label: string
}

interface Props {
  /** 当前页面要展示的快捷键清单。 */
  shortcuts: ShortcutItem[]
  /**
   * 是否在 window 上绑定 `?` / `Esc` 来开关浮层。默认 true。
   * 调用方如果已经在外层自己处理键盘事件（例如详情页），可以传 false 避免冲突。
   */
  bindToggleKey?: boolean
  /** 自定义触发按钮的 className，用于在不同页面对齐样式。 */
  buttonClassName?: string
}

const DEFAULT_BUTTON_CLASS =
  'h-9 w-9 rounded-lg border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-colors'

/**
 * 全站统一的「键盘快捷键」按钮 + 浮层。
 *
 * - 不持久化 open 状态（每次按 `?` 都会就近 toggle）。
 * - 接受任意条目，调用方负责传入正确的本地化文案与按键标签。
 * - 浮层使用 `role="dialog"` + `aria-modal`，并提供"X 关闭"按钮和点击遮罩关闭。
 */
export function KeyboardShortcutsButton({
  shortcuts,
  bindToggleKey = true,
  buttonClassName,
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!bindToggleKey) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(v => !v)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindToggleKey, open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="键盘快捷键（按 ?）"
        aria-label="键盘快捷键"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={buttonClassName ?? DEFAULT_BUTTON_CLASS}
      >
        <Keyboard className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="键盘快捷键"
        >
          <div className="panel w-full max-w-sm p-5 animate-rise" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-indigo-300" />
                <h3 className="font-medium">键盘快捷键</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2.5 text-sm">
              {shortcuts.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-gray-300">{s.label}</span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="px-1.5 h-6 inline-flex items-center rounded border border-white/15 bg-white/[0.04] text-[11px] font-mono text-gray-200"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 mt-4">提示：在输入框里按这些键不会触发。</p>
          </div>
        </div>
      )}
    </>
  )
}
