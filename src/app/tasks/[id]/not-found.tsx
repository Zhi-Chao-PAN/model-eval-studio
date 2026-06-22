import Link from 'next/link'
import { ArrowLeft, LayoutDashboard, Search } from 'lucide-react'

/**
 * Contextual 404 page for /tasks/[id] when a task doesn't exist or the user
 * doesn't have access to it. Provides a direct link back to the dashboard
 * instead of the generic root 404.
 */
export default function TaskNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-5">
        <Search className="h-7 w-7 text-gray-500" />
      </div>
      <h2 className="text-xl font-medium text-white mb-2">任务不存在</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-sm leading-relaxed">
        该任务可能已被删除，或者你没有访问权限。请检查链接是否正确，或返回工作台查看你有权限的任务。
      </p>
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
          <LayoutDashboard className="h-4 w-4" />
          返回工作台
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>
    </div>
  )
}
