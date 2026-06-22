'use client'

import { useEffect, useRef, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: React.ReactNode
}

/**
 * Reusable confirmation dialog that replaces window.confirm().
 * - Backdrop click to cancel
 * - Escape key to cancel
 * - Focus trap (Tab cycles within dialog)
 * - Returns focus to trigger element on close
 * - Body scroll lock when open
 * - Accessible role="dialog" + aria-modal
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement as HTMLElement | null
    // Focus the cancel button (safe default)
    setTimeout(() => cancelBtnRef.current?.focus(), 20)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  // Focus trap: keep Tab/Shift+Tab within the dialog
  const handleTrapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleTrapFocus)
    return () => document.removeEventListener('keydown', handleTrapFocus)
  }, [open, handleTrapFocus])

  if (!open) return null

  const variantStyles = {
    danger: {
      iconBg: 'bg-red-500/20 border-red-500/30',
      iconColor: 'text-red-300',
      confirmBtn: 'bg-red-500/80 hover:bg-red-500 text-white',
    },
    warning: {
      iconBg: 'bg-amber-500/20 border-amber-500/30',
      iconColor: 'text-amber-300',
      confirmBtn: 'bg-amber-500/80 hover:bg-amber-500 text-black',
    },
    default: {
      iconBg: 'bg-indigo-500/20 border-indigo-500/30',
      iconColor: 'text-indigo-300',
      confirmBtn: 'bg-indigo-500/80 hover:bg-indigo-500 text-white',
    },
  }[variant]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={message ? 'confirm-dialog-desc' : undefined}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div ref={dialogRef} className="panel p-5 w-full max-w-md animate-rise" style={{ background: 'rgba(15,15,20,0.95)' }}>
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${variantStyles.iconBg}`}>
            <AlertTriangle className={`h-5 w-5 ${variantStyles.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="font-medium text-white">{title}</h3>
            {message && (
              <p id="confirm-dialog-desc" className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                {message}
              </p>
            )}
            {children}
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 transition flex-shrink-0 disabled:opacity-40"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={loading}
            className="px-4 h-9 rounded-md text-sm text-gray-300 hover:text-white hover:bg-white/5 border border-white/10 transition disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 h-9 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${variantStyles.confirmBtn}`}
          >
            {loading && <div className="h-3 w-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
