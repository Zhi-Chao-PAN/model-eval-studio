'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical, ArrowRight, AlertCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export default function RegisterPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) { setError('两次输入的密码不一致'); return }
    if (username.length < 3 || username.length > 32) { setError('用户名长度需在 3-32 个字符之间'); return }
    if (password.length < 8 || password.length > 128) { setError('密码长度需在 8-128 个字符之间'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode, username, password }),
      })
      // Safely parse JSON to avoid SyntaxError if server returns HTML error page
      const text = await res.text()
      let data: any = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: text.slice(0, 200) } }
      if (!res.ok) throw new Error(data.error || '注册失败，请稍后重试')
      router.push('/dashboard')
      router.refresh()
    } catch (e: any) {
      setError(e.message || '注册失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full blur-[120px] bg-gradient-to-r from-indigo-600/30 via-violet-600/20 to-fuchsia-600/20" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 mb-10">
          <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <FlaskConical className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight text-white text-lg">ModelEval Studio</span>
        </Link>

        <div className="glass-strong p-7 animate-rise">
          <div className="text-center mb-7">
            <h1 className="text-xl font-semibold tracking-tight text-white">创建账户</h1>
            <p className="text-sm text-gray-400 mt-1.5">使用管理员发的邀请码加入</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite" className="flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" /> 邀请码
              </Label>
              <Input
                id="invite"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="向管理员索取邀请码"
                className="font-mono"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-32 个字符"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">确认密码</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={submitting}>
              完成注册 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </form>

          <div className="hairline-t my-5" />
          <div className="text-center text-sm text-gray-400">
            已有账户？{' '}
            <Link href="/login" className="text-indigo-300 hover:text-indigo-200 font-medium">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}