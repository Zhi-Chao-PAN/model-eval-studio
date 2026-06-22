import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '注册',
  description: '注册 ModelEval Studio 账号，开始多模型测试评估。',
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
