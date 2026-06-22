'use client'

import { useEffect } from 'react'

/**
 * Route-level error boundary. Catches errors within the main layout tree
 * and renders a friendly fallback without unmounting the entire root HTML
 * (unlike global-error.tsx which replaces the whole document).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[ErrorBoundary] Unhandled route error (see server logs for details)')
    } else {
      console.error('[ErrorBoundary] Unhandled route error:', error)
    }
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">页面出错了</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            应用遇到了一个意外错误，请刷新或重试。
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            重试
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            返回首页
          </a>
        </div>
        {process.env.NODE_ENV !== 'production' && error.message && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-white/50 font-mono">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  )
}
