'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

/**
 * Global error boundary for the App Router.
 *
 * Catches unhandled errors thrown by Server Components, Client Components,
 * or data fetching in the rendering tree. Returns a user-friendly error
 * page rather than exposing stack traces (Next.js only shows the dev overlay
 * in development; in production this is the only fallback).
 *
 * Note: this does NOT catch API route errors — those are handled per-route
 * by the try/catch + safeServerError pattern established across the API layer.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // In production, avoid leaking stack traces / internal paths to the browser console.
    // Server logs still contain the full error via the API layer's safeServerError.
    if (process.env.NODE_ENV === 'production') {
      console.error('[RootErrorBoundary] Unhandled rendering error (see server logs for details)')
    } else {
      console.error('[RootErrorBoundary] Unhandled rendering error:', error)
    }
  }, [error])

  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col items-center justify-center bg-[#07070b] text-white antialiased px-6">
        <div className="max-w-md text-center space-y-6">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">页面出错了</h1>
            <p className="text-sm text-white/60 leading-relaxed">
              应用遇到了一个意外错误。请刷新页面重试，如果问题持续存在请联系管理员。
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
            >
              <Home className="h-3.5 w-3.5" /> 返回工作台
            </a>
          </div>
          {process.env.NODE_ENV !== 'production' && error.message && (
            <pre className="mt-6 max-h-48 overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-white/50 font-mono border border-white/5">
              {error.message}
            </pre>
          )}
        </div>
      </body>
    </html>
  )
}
