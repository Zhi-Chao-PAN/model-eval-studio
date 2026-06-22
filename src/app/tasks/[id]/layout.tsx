import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Topbar } from '@/components/topbar'

export const metadata: Metadata = {
  title: '评测任务',
  description: '任务详情：设计题目、上传产物、生成 AI 评估报告。',
}

export default async function TaskLayout({
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
      <main className="flex-1 container-page py-6">{children}</main>
    </div>
  )
}