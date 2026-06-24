import type { Metadata } from 'next'
import { SkipLink } from '@/components/ui/SkipLink'

export const metadata: Metadata = {
  title: '分享的评测',
  description: '查看 ModelEval Studio 中分享的模型评测任务与评估报告。',
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#07070b]">
      <SkipLink />
      <main id="main-content" className="flex-1 container-page py-8">{children}</main>
    </div>
  )
}
