'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from 'lucide-react'

/**
 * Task-detail error boundary. Catches rendering errors within the task
 * detail page (which is the most complex interactive page in the app)
 * and provides recovery options without blanking the entire page shell.
 */
export default function TaskError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[TaskError] Unhandled task page error (see server logs for details)')
    } else {
      console.error('[TaskError] Unhandled task page error:', error)
    }
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 items-center justify-center mb-2">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">任务页面出错了</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            加载任务数据或组件时遇到意外错误，你可以重试或返回工作台。
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重试
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
          >
            <Home className="h-3.5 w-3.5" /> 返回工作台
          </Link>
        </div>
        {process.env.NODE_ENV !== 'production' && error.message && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-white/50 font-mono border border-white/5">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  )
}
