'use client'

import { useEffect } from 'react'

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
    // Log the error to the console in production for debugging via
    // monitoring tools; Next.js also captures the digest for tracking.
    console.error('[RootErrorBoundary] Unhandled rendering error:', error)
  }, [error])

  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col items-center justify-center bg-[#07070b] text-white antialiased px-6">
        <div className="max-w-md text-center space-y-6">
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
            <pre className="mt-6 max-h-48 overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-white/50 font-mono">
              {error.message}
            </pre>
          )}
        </div>
      </body>
    </html>
  )
}
