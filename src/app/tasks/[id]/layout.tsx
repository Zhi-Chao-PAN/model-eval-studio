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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        跳转到主要内容
      </a>
      <Topbar user={{ username: session.username, role: session.role }} />
      <main id="main-content" className="flex-1 container-page py-6">{children}</main>
    </div>
  )
}