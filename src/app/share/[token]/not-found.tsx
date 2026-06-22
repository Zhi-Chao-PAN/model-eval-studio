import Link from 'next/link'
import { ArrowLeft, ShieldAlert, Home } from 'lucide-react'

/**
 * Contextual 404 page for /share/[token] when a share link is invalid, expired, or revoked.
 */
export default function ShareNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="h-16 w-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="h-7 w-7 text-gray-500" />
        </div>
        <h2 className="text-xl font-medium text-white mb-2">分享链接无效或已失效</h2>
        <p className="text-sm text-gray-400 mb-8 leading-relaxed">
          该分享链接可能已被撤销、过期，或者链接地址有误。请联系分享者重新获取有效的链接。
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
            <Home className="h-4 w-4" />
            返回首页
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-sm transition-colors">
            <ArrowLeft className="h-4 w-4" />
            去登录
          </Link>
        </div>
      </div>
    </div>
  )
}
