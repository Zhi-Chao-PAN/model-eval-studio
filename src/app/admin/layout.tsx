import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Topbar } from '@/components/topbar'
import { SkipLink } from '@/components/ui/SkipLink'

export const metadata: Metadata = {
  title: '管理后台',
  description: 'ModelEval Studio 系统管理：用户管理、邀请码、审计日志。',
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  if (session.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col">
      <SkipLink />
      <Topbar user={{ username: session.username, role: session.role }} />
      <main id="main-content" className="flex-1 container-page py-8">{children}</main>
    </div>
  )
}