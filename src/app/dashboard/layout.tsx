import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Topbar } from '@/components/topbar'

export const metadata: Metadata = {
  title: '控制台',
  description: '查看你的评测任务列表，管理和跟踪所有模型测试评估项目。',
}

export default async function DashboardLayout({
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