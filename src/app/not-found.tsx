import Link from 'next/link'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="space-y-4">
          <p className="text-sm font-mono text-white/30">404</p>
          <div className="inline-flex h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center">
            <ArrowLeft className="h-6 w-6 text-gray-500" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">页面不存在</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            你访问的页面可能已被删除、重命名，或者从未存在。
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            <Home className="h-3.5 w-3.5" /> 返回工作台
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
