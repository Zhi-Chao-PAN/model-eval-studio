'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface NavbarProps {
  user: {
    username: string
    role: string
  }
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard', label: '我的任务' },
    { href: '/settings', label: '个人设置' },
  ]

  if (user.role === 'ADMIN') {
    navItems.push({ href: '/admin', label: '管理后台' })
  }

  return (
    <nav className="border-b border-slate-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-semibold text-blue-600 text-lg">
            模型测试评估辅助工具
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition ${
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">
            {user.username}
            {user.role === 'ADMIN' && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                管理员
              </span>
            )}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-900 transition"
          >
            退出
          </button>
        </div>
      </div>
    </nav>
  )
}