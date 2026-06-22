'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Settings as SettingsIcon, Key, Save, Check, User as UserIcon, FlaskConical,
  CheckCircle2, XCircle, Loader2, Sparkles, ShieldCheck, Wand2, AlertTriangle, RefreshCw,
  Eye, EyeOff, ArrowRight, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, Select } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AiPreset {
  id: string
  name: string
  provider: 'OPENAI_COMPAT' | 'ANTHROPIC_COMPAT'
  baseUrl: string
  modelName: string
  hint?: string
}

const AI_PRESETS: AiPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-v4-pro',
  },
  {
    id: 'minimax',
    name: 'MiniMax-M3',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://api.minimax.chat/v1',
    modelName: 'abab7-chat',
  },
  {
    id: 'kimi',
    name: 'Kimi 月之暗面',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-128k',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM-5.2',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-5.2',
  },
  {
    id: 'qwen',
    name: '通义千问 Qwen3.7',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen3.7-plus',
  },
  {
    id: 'doubao',
    name: '豆包 火山方舟',
    provider: 'OPENAI_COMPAT',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelName: 'doubao-seed-2.0-pro',
    hint: '标准 ARK 接入点',
  },
]

export default function SettingsPage() {
  const [background, setBackground] = useState('')
  const [savingBg, setSavingBg] = useState(false)
  const [bgSaved, setBgSaved] = useState(false)
  const [provider, setProvider] = useState('OPENAI_COMPAT')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [savingAi, setSavingAi] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [me, setMe] = useState<any>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bgError, setBgError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const isWelcome = searchParams.get('welcome') === '1'

  async function load() {
    setLoadError(null)
    try {
      const [meRes, aiRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/user/ai-config'),
      ])
      const [data, aiData] = await Promise.all([
        meRes.json().catch(() => ({})),
        aiRes.json().catch(() => ({})),
      ])
      if (!meRes.ok) throw new Error(data.error || '账户信息加载失败，请稍后重试')
      if (data.user) {
        setMe(data.user)
        setBackground(data.user.background || '')
      }
      if (!aiRes.ok) throw new Error(aiData.error || 'AI 配置加载失败，请稍后重试')
      if (aiData.config) {
        setProvider(aiData.config.provider)
        setBaseUrl(aiData.config.baseUrl || '')
        setModelName(aiData.config.modelName || '')
        setMaxTokens(aiData.config.maxTokens?.toString() || '')
        setHasApiKey(aiData.config.hasApiKey)
      }
    } catch (err: any) {
      setLoadError(err?.message || '加载失败，请重试')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => { load() }, [])

  async function saveBackground() {
    setSavingBg(true)
    setBgSaved(false)
    setBgError(null)
    try {
      const res = await fetch('/api/user/background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '保存失败，请稍后重试')
      }
      setBgSaved(true)
      setTimeout(() => setBgSaved(false), 2000)
    } catch (err) {
      setBgError(err instanceof Error ? err.message : '保存失败，请检查网络连接')
    } finally {
      setSavingBg(false)
    }
  }

  async function saveAiConfig() {
    setSavingAi(true)
    setAiSaved(false)
    setAiError(null)
    try {
      const res = await fetch('/api/user/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider, baseUrl, apiKey, modelName,
          maxTokens: maxTokens ? Number(maxTokens) : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '保存失败，请稍后重试')
      }
      setAiSaved(true)
      setHasApiKey(true)
      setApiKey('')
      setTimeout(() => setAiSaved(false), 2000)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '保存失败，请检查网络连接')
    } finally {
      setSavingAi(false)
    }
  }

  async function validateKey() {
    if (!baseUrl || !modelName || (!apiKey && !hasApiKey)) {
      setValidateResult({ ok: false, error: '请先填写完整的 AI 配置信息' })
      return
    }
    setValidating(true); setValidateResult(null)
    try {
      // 直接用当前表单值测试，不经过保存
      const res = await fetch('/api/user/ai-config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          apiKey: apiKey || undefined, // 如果当前表单没填 key，则用 DB 里已存的（后端回退）
          modelName,
        }),
      })
      // Safely parse JSON to handle non-JSON error responses
      const text = await res.text()
      let data: any = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: '服务器返回了非预期内容' } }
      if (!res.ok && !data.ok) {
        setValidateResult({ ok: false, error: data.error || '测试连接失败，请检查配置后重试' })
        return
      }
      setValidateResult(data)
    } catch (err) {
      setValidateResult({ ok: false, error: err instanceof Error ? err.message : '测试连接失败，请检查网络' })
    } finally {
      setValidating(false)
    }
  }

  async function changePassword() {
    setPwError(null)
    setPwSaved(false)
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('请填写完整的密码信息')
      return
    }
    if (newPassword.length < 8) {
      setPwError('新密码长度不能少于 8 个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('两次输入的新密码不一致')
      return
    }
    if (currentPassword === newPassword) {
      setPwError('新密码不能与当前密码相同')
      return
    }
    setSavingPw(true)
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '修改密码失败，请稍后重试')
      setPwSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 3000)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : '修改密码失败，请检查网络连接')
    } finally {
      setSavingPw(false)
    }
  }

  if (!loaded) return (
    <div className="flex flex-col items-center justify-center py-20 gap-2">
      <Loader2 className="h-5 w-5 text-gray-500 animate-spin" />
      <p className="text-xs text-gray-500">正在加载设置...</p>
    </div>
  )

  if (loadError) {
    return (
      <div className="panel p-10 text-center max-w-md mx-auto mt-10">
        <AlertTriangle className="h-10 w-10 mx-auto text-amber-400 mb-3" />
        <h2 className="text-lg font-medium mb-1">设置加载失败</h2>
        <p className="text-sm text-gray-400 mb-4">{loadError}</p>
        <Button size="sm" onClick={() => { setLoaded(false); setLoadError(null); load() }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重试
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h1 className="display text-2xl sm:text-3xl">设置</h1>
          <p className="text-sm text-gray-400 mt-1">配置 AI 模型与个人偏好</p>
        </div>
      </div>

      {/* Welcome banner for new users */}
      {isWelcome && (
        <div className="panel p-4 mb-6 border-emerald-500/30 bg-emerald-500/[0.06]">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-emerald-200 mb-1">注册成功！欢迎使用 ModelEval Studio</div>
              <div className="text-xs text-emerald-200/70 leading-relaxed">
                开始使用前，请先配置你的 AI 模型接入信息。配置完成后即可创建任务、使用 AI 辅助评测。你也可以先填写个人背景，帮助 AI 更好地理解你的评估场景。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* First-time setup banner */}
      {loaded && !baseUrl && !modelName && !isWelcome && (
        <div className="panel p-4 mb-6 border-amber-500/30 bg-amber-500/[0.06]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-amber-200 mb-1">首次使用：请先配置 AI 模型</div>
              <div className="text-xs text-amber-200/70 leading-relaxed">
                在使用 AI 出题、截图分析、产物分析、生成报告等功能前，你需要先配置 AI 服务端点和 API Key。
                点击下方任意「快速选择」按钮自动填充常用服务商配置，然后填入你的 API Key 即可。
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: AI Config (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Config Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <Key className="h-4 w-4 text-gray-400" /> AI 模型配置
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                填写自己的 API Key，所有调用走你的额度。密钥服务端加密存储。
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Quick Presets */}
              <div>
                <Label className="flex items-center gap-1.5 mb-2">
                  <Wand2 className="h-3.5 w-3.5 text-indigo-400" /> 快速选择
                  <span className="text-[11px] text-gray-500 font-normal ml-1">点击自动填充，之后可手动修改</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {AI_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setProvider(preset.provider)
                        setBaseUrl(preset.baseUrl)
                        setModelName(preset.modelName)
                        setValidateResult(null)
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-gray-300 hover:bg-white/[0.08] hover:text-white hover:border-indigo-500/40 transition-colors"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

            <div className="space-y-1.5">
              <Label>协议格式</Label>
              <Select value={provider} onChange={e => setProvider(e.target.value)}>
                <option value="OPENAI_COMPAT">OpenAI 兼容</option>
                <option value="ANTHROPIC_COMPAT">Anthropic 兼容</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1" className="mono" />
              <p className="text-[11px] text-gray-500 mt-1">
                支持 OpenAI / DeepSeek / Groq / Ollama / 国产兼容 API 等
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                API Key
                {hasApiKey && <Badge variant="success" className="ml-1"><Check className="h-2.5 w-2.5" /> 已存储</Badge>}
              </Label>
              <div className="relative">
                <Input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder={hasApiKey ? '留空则保留原 Key' : 'sk-...'} className="mono pr-10" autoComplete="off" />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>模型名称</Label>
              <Input value={modelName} onChange={e => setModelName(e.target.value)}
                placeholder="gpt-4o / claude-3.5-sonnet / deepseek-chat" className="mono" />
              {baseUrl.includes('volces.com') && (
                <p className="text-[11px] text-amber-400 mt-1">
                  火山方舟：默认使用 doubao-seed-2.0-pro，也可填入你自己的接入点 ID（<code className="mono">ep-xxxxxxx</code>）
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                最大输出 Token
                <span className="text-[10px] text-gray-500 font-normal">控制单次 AI 回复的长度上限</span>
              </Label>
              <Input type="number" value={maxTokens} onChange={e => {
                const v = Number(e.target.value)
                if (v > 200000) e.target.value = '200000'
                setMaxTokens(e.target.value)
              }}
                placeholder="4000" className="mono" min={1} max={200000} />
              <p className="text-[11px] text-gray-500 mt-1">
                留空则使用默认值 4000；长上下文模型可适当调大（如 16000 / 32000 / 200000）
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <Button onClick={saveAiConfig} loading={savingAi}>
                <Save className="h-3.5 w-3.5" /> 保存配置
              </Button>
              <Button variant="secondary" onClick={validateKey} loading={validating} disabled={!baseUrl || !modelName}>
                <Sparkles className="h-3.5 w-3.5" /> 测试连接
              </Button>
              {aiSaved && isWelcome && (
                <Link href="/dashboard" className="ml-2">
                  <Button variant="ghost">
                    前往工作台 <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              )}
              {aiSaved && !isWelcome && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="h-3 w-3" /> 已保存</span>}
            </div>

            {aiError && (
              <div className="text-sm px-3 py-2 rounded-lg border bg-red-500/10 text-red-300 border-red-500/20 flex items-center gap-2">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1">{aiError}</span>
                <button onClick={() => setAiError(null)} className="text-red-400/70 hover:text-red-300 text-xs">关闭</button>
              </div>
            )}

            {validateResult && (
              <div className={`text-sm px-3 py-2 rounded-lg border flex items-start gap-2 ${
                validateResult.ok
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-300 border-red-500/20'
              }`}>
                {validateResult.ok
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <span>{validateResult.ok ? '连接正常，模型可调用' : '连接失败：' + validateResult.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Right column: Account + Background (1/3 width) */}
        <div className="space-y-6">
          {/* Account Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <UserIcon className="h-4 w-4 text-gray-400" /> 账户信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center text-lg font-semibold text-white">
                  {me?.username?.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-white flex items-center gap-2">
                    {me?.username}
                    {me?.role === 'ADMIN' && (
                      <Badge variant="primary" className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> 管理员
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 mono">
                    注册 {me?.createdAt ? new Date(me.createdAt).toLocaleDateString('zh-CN') : '-'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Background Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <FlaskConical className="h-4 w-4 text-gray-400" /> 个人背景
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                告诉 AI 你的身份与偏好，AI 在分析时会据此调整叙述风格与视角。
              </p>
            </CardHeader>
            <CardContent>
              <Textarea value={background} onChange={e => setBackground(e.target.value)} rows={6}
                placeholder="例如：我是后端工程师，主要写 Go / Python，关注代码质量与性能，偏好简洁专业的回答..." />
              <div className="flex items-center gap-3 mt-3">
                <Button onClick={saveBackground} loading={savingBg}>
                  <Save className="h-3.5 w-3.5" /> 保存
                </Button>
                {bgSaved && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="h-3 w-3" /> 已保存</span>}
              </div>
              {bgError && (
                <div className="mt-3 text-sm px-3 py-2 rounded-lg border bg-red-500/10 text-red-300 border-red-500/20 flex items-center gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{bgError}</span>
                  <button onClick={() => setBgError(null)} className="text-red-400/70 hover:text-red-300 text-xs">关闭</button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Password Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <Lock className="h-4 w-4 text-gray-400" /> 修改密码
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                定期更换密码有助于保护账户安全。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>当前密码</Label>
                <div className="relative">
                  <Input type={showCurrentPw ? 'text' : 'password'} value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)} placeholder="输入当前密码"
                    className="pr-10" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}>
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>新密码</Label>
                <div className="relative">
                  <Input type={showNewPw ? 'text' : 'password'} value={newPassword}
                    onChange={e => setNewPassword(e.target.value)} placeholder="至少 8 个字符"
                    className="pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}>
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>确认新密码</Label>
                <Input type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入新密码"
                  autoComplete="new-password" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button onClick={changePassword} loading={savingPw}
                  disabled={!currentPassword || !newPassword || !confirmPassword}>
                  <Lock className="h-3.5 w-3.5" /> 修改密码
                </Button>
                {pwSaved && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="h-3 w-3" /> 密码已更新</span>}
              </div>
              {pwError && (
                <div className="text-sm px-3 py-2 rounded-lg border bg-red-500/10 text-red-300 border-red-500/20 flex items-center gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{pwError}</span>
                  <button onClick={() => setPwError(null)} className="text-red-400/70 hover:text-red-300 text-xs">关闭</button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}