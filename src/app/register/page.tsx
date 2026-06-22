'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical, ArrowRight, AlertCircle, KeyRound, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

export default function RegisterPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  // Password strength calculation
  const passwordStrength = (() => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    if (score <= 1) return { score: 1, label: '弱', color: 'bg-red-500' }
    if (score <= 2) return { score: 2, label: '一般', color: 'bg-amber-500' }
    if (score <= 3) return { score: 3, label: '中等', color: 'bg-yellow-500' }
    if (score <= 4) return { score: 4, label: '强', color: 'bg-emerald-500' }
    return { score: 5, label: '很强', color: 'bg-emerald-400' }
  })()

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
      router.push('/settings?welcome=1')
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
                placeholder="向管理员索取邀请码（8-32 位十六进制字符）"
                className="font-mono"
                autoFocus
                required
                disabled={submitting}
                aria-invalid={!!error}
                aria-describedby={error ? 'register-error' : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-32 个字符，支持中英文、数字、下划线、连字符"
                autoComplete="username"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-1.5">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= passwordStrength.score ? passwordStrength.color : 'bg-white/10'
                      }`} />
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    密码强度：<span className={
                      passwordStrength.score <= 2 ? 'text-red-400' :
                      passwordStrength.score <= 3 ? 'text-amber-400' : 'text-emerald-400'
                    }>{passwordStrength.label}</span>
                    <span className="text-gray-400 ml-2">建议使用大小写字母+数字+符号</span>
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">确认密码</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  className={`pr-10 ${passwordsMismatch ? 'border-red-500/50' : passwordsMatch ? 'border-emerald-500/30' : ''}`}
                />
                {confirmPassword.length > 0 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {passwordsMatch ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : passwordsMismatch ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : null}
                  </div>
                )}
              </div>
              {passwordsMismatch && (
                <p className="text-[11px] text-red-400">两次输入的密码不一致</p>
              )}
            </div>

            {error && (
              <div id="register-error" role="alert" className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={submitting} aria-describedby={error ? 'register-error' : undefined}>
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