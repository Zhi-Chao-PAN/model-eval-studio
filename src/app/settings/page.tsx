'use client'
import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon, Key, Save, Check, User as UserIcon, FlaskConical,
  CheckCircle2, XCircle, Loader2, Sparkles, ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, Select } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  const [background, setBackground] = useState('')
  const [savingBg, setSavingBg] = useState(false)
  const [bgSaved, setBgSaved] = useState(false)
  const [provider, setProvider] = useState('OPENAI_COMPAT')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [savingAi, setSavingAi] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [me, setMe] = useState<any>(null)

  async function load() {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    if (data.user) {
      setMe(data.user)
      setBackground(data.user.background || '')
    }
    const aiRes = await fetch('/api/user/ai-config')
    const aiData = await aiRes.json()
    if (aiData.config) {
      setProvider(aiData.config.provider)
      setBaseUrl(aiData.config.baseUrl || '')
      setModelName(aiData.config.modelName || '')
      setHasApiKey(aiData.config.hasApiKey)
    }
    setLoaded(true)
  }

  useEffect(() => { load() }, [])

  async function saveBackground() {
    setSavingBg(true)
    await fetch('/api/user/background', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ background }),
    })
    setSavingBg(false); setBgSaved(true)
    setTimeout(() => setBgSaved(false), 2000)
  }

  async function saveAiConfig() {
    setSavingAi(true)
    await fetch('/api/user/ai-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, baseUrl, apiKey, modelName }),
    })
    setSavingAi(false); setAiSaved(true); setHasApiKey(true)
    setTimeout(() => setAiSaved(false), 2000)
  }

  async function validateKey() {
    setValidating(true); setValidateResult(null)
    await fetch('/api/user/ai-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, baseUrl, apiKey: apiKey || undefined, modelName }),
    })
    const res = await fetch('/api/user/ai-config/validate', { method: 'POST' })
    const data = await res.json()
    setValidateResult(data)
    setValidating(false)
  }

  if (!loaded) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 text-gray-500 animate-spin" /></div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <SettingsIcon className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h1 className="display text-2xl sm:text-3xl">设置</h1>
          <p className="text-sm text-gray-400 mt-1">配置 AI 模型与个人偏好</p>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Account */}
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

        {/* AI Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Key className="h-4 w-4 text-gray-400" /> AI 模型配置
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              填写自己的 API Key，所有调用走你的额度。密钥服务端加密存储。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={hasApiKey ? '留空则保留原 Key' : 'sk-...'} className="mono" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>模型名称</Label>
              <Input value={modelName} onChange={e => setModelName(e.target.value)}
                placeholder="gpt-4o / claude-3.5-sonnet / deepseek-chat" className="mono" />
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <Button onClick={saveAiConfig} loading={savingAi}>
                <Save className="h-3.5 w-3.5" /> 保存配置
              </Button>
              <Button variant="secondary" onClick={validateKey} loading={validating} disabled={!baseUrl || !modelName}>
                <Sparkles className="h-3.5 w-3.5" /> 测试连接
              </Button>
              {aiSaved && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="h-3 w-3" /> 已保存</span>}
            </div>

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

        {/* Background */}
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
            <Textarea value={background} onChange={e => setBackground(e.target.value)} rows={4}
              placeholder="例如：我是后端工程师，主要写 Go / Python，关注代码质量与性能，偏好简洁专业的回答..." />
            <div className="flex items-center gap-3 mt-3">
              <Button onClick={saveBackground} loading={savingBg}>
                <Save className="h-3.5 w-3.5" /> 保存
              </Button>
              {bgSaved && <span className="text-emerald-400 text-xs flex items-center gap-1"><Check className="h-3 w-3" /> 已保存</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}