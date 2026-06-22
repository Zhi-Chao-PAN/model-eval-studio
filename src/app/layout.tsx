import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toast'

export const metadata: Metadata = {
  title: {
    default: 'ModelEval Studio — 模型测试评估工作台',
    template: '%s · ModelEval Studio',
  },
  description: 'AI 辅助的多模型测试评估工作台。输入任务，上传看板与产物，AI 生成专业评估报告。',
  keywords: ['模型评估', '大模型测试', 'AI 评估', '多模型对比', 'ModelEval Studio'],
  applicationName: 'ModelEval Studio',
  authors: [{ name: 'ModelEval Studio' }],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#07070b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col bg-[#07070b] text-white antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}