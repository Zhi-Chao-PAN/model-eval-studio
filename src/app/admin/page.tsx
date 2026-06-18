'use client'
import { useEffect, useState } from 'react'
import {
  ShieldCheck, Users, Copy, Check, Loader2, KeyRound, Plus, Power,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Invite {
  id: string
  code: string
  active: boolean
  maxUses: number
  usedCount: number
  expiresAt: string | null
  createdAt: string
  createdBy: { username: string }
}
interface User {
  id: string
  username: string
  role: string
  background: string | null
  createdAt: string
  lastActiveAt: string
  _count: { tasks: number }
}

export default function AdminPage() {
  const [tab, setTab] = useState<'invites' | 'users'>('invites')
  const [invites, setInvites] = useState<Invite[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState(1)
  const [maxUses, setMaxUses] = useState(1)
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function loadInvites() {
    const res = await fetch('/api/admin/invites')
    const data = await res.json()
    if (data.invites) setInvites(data.invites)
  }
  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    if (data.users) setUsers(data.users)
  }

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      if (tab === 'invites') await loadInvites()
      else await loadUsers()
      setLoading(false)
    })()
  }, [tab])

  async function generate() {
    setGenerating(true)
    try {
      const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString()
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, maxUses, expiresAt }),
      })
      const data = await res.json()
      if (data.invites) setInvites([...data.invites, ...invites])
    } finally { setGenerating(false) }
  }

  async function toggle(id: string) {
    await fetch('/api/admin/invites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' }),
    })
    loadInvites()
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const used = invites.reduce((s, i) => s + i.usedCount, 0)
  const totalSlots = invites.reduce((s, i) => s + i.maxUses, 0)
  const active = invites.filter(i => i.active).length
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-indigo-300" />
        </div>
        <div>
          <h1 className="display text-2xl sm:text-3xl">管理后台</h1>
          <p className="text-sm text-gray-400 mt-1">邀请码与团队成员</p>
        </div>
      </div>

      {tab === 'invites' && (
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          {[
            { icon: KeyRound, val: invites.length, label: '邀请码总数', from: 'from-indigo-500/20', to: 'to-violet-500/20', i: 'text-indigo-300' },
            { icon: Users, val: used, label: '已使用 / 总名额', detail: '/ ' + totalSlots, from: 'from-emerald-500/20', to: 'to-cyan-500/20', i: 'text-emerald-300' },
            { icon: Power, val: active, label: '可用邀请码', from: 'from-fuchsia-500/20', to: 'to-pink-500/20', i: 'text-fuchsia-300' },
          ].map((s, idx) => {
            const Icon = s.icon
            return (
              <Card key={idx}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${s.from} ${s.to} border border-white/10 flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${s.i}`} />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-white tabular flex items-baseline gap-1">
                      {s.val}
                      {s.detail && <span className="text-sm text-gray-500 mono">{s.detail}</span>}
                    </div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-1 mb-5 p-1 rounded-lg bg-white/[0.04] border border-white/5 w-fit">
        <button
          onClick={() => setTab('invites')}
          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-all ${
            tab === 'invites'
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" /> 邀请码管理
        </button>
        <button
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-all ${
            tab === 'users'
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="h-3.5 w-3.5" /> 用户管理
        </button>
      </div>

      {tab === 'invites' ? (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-[14px]">生成新邀请码</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>数量</Label>
                  <Input type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} className="tabular" />
                </div>
                <div className="space-y-1.5">
                  <Label>每个可用次数</Label>
                  <Input type="number" min={1} value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} className="tabular" />
                </div>
                <div className="space-y-1.5">
                  <Label>有效期（天）</Label>
                  <Input type="number" min={1} value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} className="tabular" />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <Button onClick={generate} loading={generating} className="w-full">
                    <Plus className="h-3.5 w-3.5" /> 生成
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            {loading ? (
              <div className="p-12 text-center"><Loader2 className="h-5 w-5 text-gray-500 animate-spin inline" /></div>
            ) : invites.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">
                <KeyRound className="h-10 w-10 mx-auto mb-3 text-gray-700" />
                还没有邀请码。
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                <div className="px-5 py-3 grid grid-cols-12 gap-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                  <div className="col-span-4">邀请码</div>
                  <div className="col-span-2">状态</div>
                  <div className="col-span-2">使用</div>
                  <div className="col-span-3">有效期</div>
                  <div className="col-span-1 text-right">操作</div>
                </div>
                {invites.map(inv => (
                  <div key={inv.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors">
                    <div className="col-span-4 flex items-center gap-2">
                      <code className="mono text-sm bg-white/[0.06] border border-white/10 px-2.5 py-1 rounded text-white tabular tracking-wide">
                        {inv.code}
                      </code>
                      <button onClick={() => copy(inv.code, inv.id)} className="text-gray-500 hover:text-white p-1 rounded transition-colors">
                        {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="col-span-2">
                      {inv.active
                        ? <Badge variant="success">可用</Badge>
                        : <Badge variant="muted">已禁用</Badge>}
                    </div>
                    <div className="col-span-2 text-sm text-gray-300 tabular">
                      {inv.usedCount} / {inv.maxUses}
                    </div>
                    <div className="col-span-3 text-xs text-gray-500 mono">
                      {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString('zh-CN') : '永久有效'}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggle(inv.id)}>
                        {inv.active ? '禁用' : '启用'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          {loading ? (
            <div className="p-12 text-center"><Loader2 className="h-5 w-5 text-gray-500 animate-spin inline" /></div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <Users className="h-10 w-10 mx-auto mb-3 text-gray-700" />
              还没有用户。
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              <div className="px-5 py-3 grid grid-cols-12 gap-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                <div className="col-span-3">用户名</div>
                <div className="col-span-2">角色</div>
                <div className="col-span-2">任务数</div>
                <div className="col-span-2">注册</div>
                <div className="col-span-3">最后活跃</div>
              </div>
              {users.map(u => (
                <div key={u.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors">
                  <div className="col-span-3 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-400/40 to-fuchsia-400/40 border border-white/10 flex items-center justify-center text-[11px] font-semibold text-white">
                      {u.username.slice(0,1).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-white">{u.username}</span>
                  </div>
                  <div className="col-span-2">
                    {u.role === 'ADMIN'
                      ? <Badge variant="primary"><ShieldCheck className="h-3 w-3" /> 管理员</Badge>
                      : <Badge variant="muted">普通用户</Badge>}
                  </div>
                  <div className="col-span-2 text-sm text-gray-300 tabular">{u._count.tasks}</div>
                  <div className="col-span-2 text-xs text-gray-500 mono">
                    {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  <div className="col-span-3 text-xs text-gray-500 mono">
                    {new Date(u.lastActiveAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}