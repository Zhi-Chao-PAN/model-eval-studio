import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Topbar } from '@/components/topbar'

export const metadata: Metadata = {
  title: '设置',
  description: '管理你的个人信息、AI 配置和账号安全设置。',
}

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session.userId) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar user={{ username: session.username, role: session.role }} />
      <main className="flex-1 container-page py-8">{children}</main>
    </div>
  )
}
