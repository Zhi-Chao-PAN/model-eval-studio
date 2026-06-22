'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { FlaskConical, LayoutDashboard, Settings, LogOut, Menu, ChevronDown, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface User {
  username: string
  role?: string
}

interface Props { user?: User | null }

export function Topbar({ user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems: Array<{ href: string; label: string; icon: any }> = [
    { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
    { href: '/settings', label: '设置', icon: Settings },
  ]
  if (user?.role === 'ADMIN') {
    navItems.push({ href: '/admin', label: '管理', icon: ShieldCheck })
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#07070b]/70 backdrop-blur-xl">
      <div className="container-page flex h-14 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2 group">
            <div className="relative h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <FlaskConical className="h-3.5 w-3.5 text-white" />
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 blur-md opacity-40 -z-10 group-hover:opacity-70 transition-opacity" />
            </div>
            <span className="font-semibold tracking-tight text-white hidden sm:inline text-[14px]">
              ModelEval <span className="text-gray-400 font-normal">Studio</span>
            </span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] transition-colors',
                      active
                        ? 'bg-white/[0.08] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="flex items-center gap-2 pl-1 pr-2.5 h-8 rounded-md text-sm text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400/80 to-fuchsia-400/80 flex items-center justify-center text-[11px] font-semibold text-white">
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate text-[13px]">{user.username}</span>
                  {user.role === 'ADMIN' && (
                    <span className="text-[10px] text-indigo-300 px-1.5 h-4 rounded bg-indigo-500/15 border border-indigo-500/25 flex items-center">ADMIN</span>
                  )}
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-20 w-52 glass-strong py-1 animate-rise">
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-[13px] text-gray-300 hover:text-white hover:bg-white/5"
                      >
                        <Settings className="h-3.5 w-3.5 inline mr-2 -mt-0.5" />
                        个人设置
                      </Link>
                      {user.role === 'ADMIN' && (
                        <Link
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="block px-3 py-2 text-[13px] text-gray-300 hover:text-white hover:bg-white/5"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 inline mr-2 -mt-0.5" />
                          管理后台
                        </Link>
                      )}
                      <div className="hairline-t my-1" />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 text-[13px] text-gray-300 hover:text-red-300 hover:bg-white/5 flex items-center gap-2"
                      >
                        <LogOut className="h-3.5 w-3.5" /> 退出登录
                      </button>
                    </div>
                  </>
                )}
              </div>

              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(v => !v)} className="md:hidden">
                {mobileOpen ? <span className="text-lg leading-none">×</span> : <Menu className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <Link href="/login"><Button size="sm">登录</Button></Link>
          )}
        </div>
      </div>

      {mobileOpen && user && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#07070b]/95 backdrop-blur-xl">
          <div className="container-page py-3 space-y-1">
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
              <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-400/80 to-fuchsia-400/80 flex items-center justify-center text-xs font-semibold text-white">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{user.username}</div>
                <div className="text-[11px] text-gray-500">
                  {user.role === 'ADMIN' ? '管理员' : '已登录'}
                </div>
              </div>
            </div>
            <div className="hairline-t my-1" />
            {navItems.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              const Icon = item.icon
              return (
                <Link
                  key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-3 h-10 rounded-md text-[14px]',
                    active ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:bg-white/5',
                  )}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </Link>
              )
            })}
            <div className="hairline-t my-2" />
            <button onClick={handleLogout} className="w-full text-left px-3 h-10 rounded-md text-[14px] text-red-400 hover:bg-red-500/5 flex items-center gap-2">
              <LogOut className="h-4 w-4" /> 退出登录
            </button>
          </div>
        </div>
      )}
    </header>
  )
}