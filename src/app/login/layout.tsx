import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '登录',
  description: '登录 ModelEval Studio，开始你的 AI 模型测试评估工作。',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
