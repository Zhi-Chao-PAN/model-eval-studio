'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  ShieldCheck, Users, Copy, Check, Loader2, KeyRound, Plus, Power,
  TrendingUp, Clock, UserCheck, UserPlus, Settings2, MoreHorizontal,
  Activity, Zap, AlertTriangle, ChevronDown, ChevronUp, Search,
  Terminal, FileText, Bot, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
interface AuditLog {
  id: string
  action: string
  userId: string | null
  taskId: string | null
  detail: any
  ipAddress: string | null
  userAgent: string | null
  path: string | null
  method: string | null
  status: string | null
  error: string | null
  tokenInput: number | null
  tokenOutput: number | null
  durationMs: number | null
  createdAt: string
  user: { username: string; role: string } | null
}
interface AuditStats {
  totalCalls: number
  aiCalls: number
  errorCalls: number
  activeUsers: number
  totalTokenInput: number
  totalTokenOutput: number
  range: string
  from: string
}

type TabKey = 'invites' | 'users' | 'audit'

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  LOGIN: { label: '登录', color: 'success', icon: UserCheck },
  LOGOUT: { label: '登出', color: 'muted', icon: Power },
  REGISTER: { label: '注册', color: 'primary', icon: UserPlus },
  TASK_CREATE: { label: '创建任务', color: 'primary', icon: FileText },
  TASK_UPDATE: { label: '更新任务', color: 'primary', icon: FileText },
  TASK_DELETE: { label: '删除任务', color: 'danger', icon: FileText },
  MODEL_ADD: { label: '添加模型', color: 'default', icon: Bot },
  MODEL_DELETE: { label: '删除模型', color: 'danger', icon: Bot },
  MODEL_UPDATE: { label: '更新模型', color: 'default', icon: Bot },
  ARTIFACT_UPLOAD: { label: '上传产物', color: 'warn', icon: FileText },
  ARTIFACT_DELETE: { label: '删除产物', color: 'danger', icon: FileText },
  AI_CHAT: { label: 'AI 对话', color: 'primary', icon: Terminal },
  AI_IDEA_GENERATE: { label: '生成思路', color: 'primary', icon: Bot },
  AI_SCREENSHOT_ANALYZE: { label: '截图分析', color: 'primary', icon: Eye },
  AI_ARTIFACT_ANALYZE: { label: '产物分析', color: 'primary', icon: Bot },
  AI_REPORT_GENERATE: { label: '生成报告', color: 'primary', icon: FileText },
  USER_SETTINGS_UPDATE: { label: '更新设置', color: 'muted', icon: Settings2 },
  AI_CONFIG_UPDATE: { label: '更新 AI 配置', color: 'primary', icon: Settings2 },
  ADMIN_INVITE_CREATE: { label: '创建邀请码', color: 'success', icon: KeyRound },
  ADMIN_INVITE_TOGGLE: { label: '切换邀请码', color: 'warn', icon: Power },
  ADMIN_USER_VIEW: { label: '查看用户', color: 'muted', icon: Users },
  ADMIN_AUDIT_VIEW: { label: '查看审计', color: 'muted', icon: Activity },
  EXPORT: { label: '导出报告', color: 'default', icon: FileText },
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('invites')
  const [invites, setInvites] = useState<Invite[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState(1)
  const [maxUses, setMaxUses] = useState(1)
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [auditPageSize] = useState(20)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditRange, setAuditRange] = useState<'today' | '7d' | '30d'>('today')
  const [auditAction, setAuditAction] = useState<string>('')
  const [auditUserId, setAuditUserId] = useState<string>('')
  const [auditStatus, setAuditStatus] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
  async function loadAuditLogs() {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(auditPage))
      params.set('pageSize', String(auditPageSize))
      if (auditUserId) params.set('userId', auditUserId)
      if (auditAction) params.set('action', auditAction)
      if (auditStatus) params.set('status', auditStatus)
      if (auditRange === 'today') {
        const d = new Date()
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        params.set('from', start.toISOString())
      } else if (auditRange === '7d') {
        params.set('from', new Date(Date.now() - 7 * 86400_000).toISOString())
      } else if (auditRange === '30d') {
        params.set('from', new Date(Date.now() - 30 * 86400_000).toISOString())
      }

      const [logsRes, statsRes] = await Promise.all([
        fetch('/api/admin/audit-logs?' + params.toString()),
        fetch('/api/admin/audit-stats?range=' + auditRange),
      ])
      const logsData = await logsRes.json()
      const statsData = await statsRes.json()
      if (logsData.logs) setAuditLogs(logsData.logs)
      if (logsData.total !== undefined) setAuditTotal(logsData.total)
      if (statsData.stats) setAuditStats(statsData.stats)
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      // 初始加载：用户和邀请码是轻量数据，并行加载，确保顶部统计卡片有数据
      const loads: Promise<any>[] = [loadInvites(), loadUsers()]
      if (tab === 'audit') loads.push(loadAuditLogs())
      await Promise.all(loads)
      setLoading(false)
    })()
  }, [tab])

  useEffect(() => {
    if (tab === 'audit') {
      setAuditPage(1)
      loadAuditLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditAction, auditUserId, auditStatus, auditRange])

  useEffect(() => {
    if (tab === 'audit' && auditPage > 1) {
      loadAuditLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPage])

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
    setTimeout(() => setCopiedId(null), 1600)
  }

  const used = invites.reduce((s, i) => s + i.usedCount, 0)
  const totalSlots = invites.reduce((s, i) => s + i.maxUses, 0)
  const active = invites.filter(i => i.active).length
  const usageRate = totalSlots > 0 ? Math.round(used / totalSlots * 100) : 0
  const adminCount = users.filter(u => u.role === 'ADMIN').length

  const allActions = useMemo(() => Object.keys(ACTION_LABELS).sort(), [])

  function ActionBadge({ action }: { action: string }) {
    const meta = ACTION_LABELS[action] || { label: action, color: 'muted', icon: Activity }
    const Icon = meta.icon
    return (
      <Badge variant={meta.color as any} className="inline-flex items-center gap-1">
        <Icon className="h-3 w-3" /> {meta.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6 animate-rise pb-12">
      {/* === HEADER === */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="relative h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-400/20 to-transparent blur-md" />
            <ShieldCheck className="h-6 w-6 text-indigo-300 relative z-10" />
          </div>
          <div>
            <h1 className="display text-2xl sm:text-3xl tracking-tight">管理后台</h1>
            <p className="text-sm text-gray-400 mt-1">邀请码分发 · 用户管理 · 审计追踪</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/10 flex items-center gap-2 text-[11px] text-gray-400 mono">
            <Settings2 className="h-3.5 w-3.5" />
            管理员模式
          </div>
        </div>
      </div>

      {/* === TABS === */}
      <div className="inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/5">
        <button
          onClick={() => setTab('invites')}
          className={cn(
            'inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all',
            tab === 'invites'
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-gray-400 hover:text-white',
          )}
        >
          <KeyRound className="h-3.5 w-3.5" />
          邀请码
        </button>
        <button
          onClick={() => setTab('users')}
          className={cn(
            'inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all',
            tab === 'users'
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-gray-400 hover:text-white',
          )}
        >
          <Users className="h-3.5 w-3.5" />
          用户
        </button>
        <button
          onClick={() => setTab('audit')}
          className={cn(
            'inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all',
            tab === 'audit'
              ? 'bg-white/[0.08] text-white shadow-sm'
              : 'text-gray-400 hover:text-white',
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          审计日志
        </button>
      </div>

      {/* === INVITES TAB === */}
      {tab === 'invites' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="score-tile indigo">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">邀请码</span>
                  <KeyRound className="h-4 w-4 text-indigo-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {invites.length}
                </div>
                <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {active} 个可用
                </div>
              </div>
            </div>
            <div className="score-tile emerald">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">已注册</span>
                  <UserCheck className="h-4 w-4 text-emerald-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none flex items-baseline gap-1">
                  {used}
                  <span className="text-sm text-gray-500 mono font-normal">/ {totalSlots}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full" style={{ width: usageRate + '%' }} />
                  </div>
                  <span className="text-[10px] text-gray-500 mono tabular w-8 text-right">{usageRate}%</span>
                </div>
              </div>
            </div>
            <div className="score-tile amber">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">使用次数</span>
                  <TrendingUp className="h-4 w-4 text-amber-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {used}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  平均 {totalSlots > 0 ? (used / totalSlots * 100).toFixed(1) : '0'}% 使用率
                </div>
              </div>
            </div>
            <div className="score-tile violet">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">用户数</span>
                  <Users className="h-4 w-4 text-violet-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {users.length}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  含 {adminCount} 名管理员
                </div>
              </div>
            </div>
          </div>

          {/* Generate form */}
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-white/10 flex items-center justify-center">
                <UserPlus className="h-3.5 w-3.5 text-violet-300" />
              </div>
              <h3 className="text-[14px] font-medium text-white">生成邀请码</h3>
              <span className="text-[11px] text-gray-500 ml-auto">设置批量生成参数</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>数量</Label>
                <Input type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} className="tabular bg-white/[0.02] border-white/[0.08]" />
              </div>
              <div className="space-y-1.5">
                <Label>每码可用次数</Label>
                <Input type="number" min={1} value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} className="tabular bg-white/[0.02] border-white/[0.08]" />
              </div>
              <div className="space-y-1.5">
                <Label>有效期（天）</Label>
                <Input type="number" min={1} value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} className="tabular bg-white/[0.02] border-white/[0.08]" />
              </div>
              <div>
                <Button onClick={generate} loading={generating} className="w-full">
                  <Plus className="h-3.5 w-3.5" /> 生成 {count > 1 ? count + ' 个' : ''}
                </Button>
              </div>
            </div>
          </div>

          {/* Invite list table */}
          <div className="panel p-0 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-indigo-400" />
                <span className="text-[13px] font-medium text-white">邀请码列表</span>
                <Badge variant="muted" className="text-[10px]">{invites.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={loadInvites}>
                <Loader2 className="h-3 w-3" /> 刷新
              </Button>
            </div>

            {loading ? (
              <div className="p-16 text-center">
                <Loader2 className="h-6 w-6 text-gray-500 animate-spin inline" />
              </div>
            ) : invites.length === 0 ? (
              <div className="p-16 text-center">
                <div className="relative inline-flex mb-4">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 blur-xl rounded-full" />
                  <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-white/10 flex items-center justify-center">
                    <KeyRound className="h-5 w-5 text-indigo-300" />
                  </div>
                </div>
                <p className="text-[13px] text-gray-400 mb-1">还没有邀请码</p>
                <p className="text-[11px] text-gray-600 mb-4">在上方生成新的邀请码</p>
                <Button size="sm" onClick={generate}>
                  <Plus className="h-3.5 w-3.5" /> 生成第一个邀请码
                </Button>
              </div>
            ) : (
              <div>
                <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-white/[0.04]">
                  <div className="col-span-4">邀请码</div>
                  <div className="col-span-2">状态</div>
                  <div className="col-span-2">使用进度</div>
                  <div className="col-span-3">到期时间</div>
                  <div className="col-span-1 text-right">操作</div>
                </div>
                {invites.map(inv => {
                  const progress = inv.maxUses > 0 ? Math.round(inv.usedCount / inv.maxUses * 100) : 0
                  const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date()
                  return (
                    <div key={inv.id} className="px-5 py-3.5 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors group border-b border-white/[0.02] last:border-0">
                      <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-white/10 flex items-center justify-center flex-shrink-0">
                          <KeyRound className="h-3.5 w-3.5 text-violet-200" />
                        </div>
                        <div className="min-w-0">
                          <code className="mono text-sm bg-white/[0.06] border border-white/10 px-2 py-0.5 rounded text-white tabular tracking-wide">
                            {inv.code}
                          </code>
                          <div className="text-[10px] text-gray-600 mt-0.5">由 {inv.createdBy.username} 创建</div>
                        </div>
                        <button onClick={() => copy(inv.code, inv.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white flex-shrink-0">
                          {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <div className="col-span-2">
                        {inv.active && !expired
                          ? <Badge variant="success">● 可用</Badge>
                          : <Badge variant="muted">● {expired ? '已过期' : '已禁用'}</Badge>}
                      </div>
                      <div className="col-span-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px] tabular">
                          <span className="text-gray-300">{inv.usedCount}<span className="text-gray-600"> / {inv.maxUses}</span></span>
                          <span className="text-gray-500 mono">{progress}%</span>
                        </div>
                        <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', progress === 100 ? 'bg-emerald-400' : progress > 50 ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-indigo-400 to-violet-400')}
                            style={{ width: progress + '%' }}
                          />
                        </div>
                      </div>
                      <div className="col-span-3 text-xs">
                        {inv.expiresAt ? (
                          <div className={cn('mono', expired ? 'text-red-400' : 'text-gray-400')}>
                            {new Date(inv.expiresAt).toLocaleDateString('zh-CN')}
                            {expired && <span className="text-[10px] ml-1 text-red-400">(已过期)</span>}
                          </div>
                        ) : (
                          <span className="text-emerald-400 text-[11px]">永久有效</span>
                        )}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          onClick={() => toggle(inv.id)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-colors',
                            inv.active
                              ? 'text-gray-400 hover:text-red-300 hover:bg-red-500/10'
                              : 'text-emerald-400 hover:bg-emerald-500/10',
                          )}
                        >
                          <Power className="h-3 w-3" />
                          {inv.active ? '禁用' : '启用'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* === USERS TAB === */}
      {tab === 'users' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="score-tile violet">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">总用户</span>
                  <Users className="h-4 w-4 text-violet-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">{users.length}</div>
                <div className="mt-2 text-[11px] text-gray-500">{adminCount} 名管理员</div>
              </div>
            </div>
            <div className="score-tile cyan">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">活跃</span>
                  <UserCheck className="h-4 w-4 text-cyan-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {users.filter(u => Date.now() - new Date(u.lastActiveAt).getTime() < 7 * 86400_000).length}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">近 7 天活跃</div>
              </div>
            </div>
            <div className="score-tile indigo">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">总任务</span>
                  <Power className="h-4 w-4 text-indigo-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {users.reduce((s, u) => s + u._count.tasks, 0)}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">平均 {users.length > 0 ? (users.reduce((s, u) => s + u._count.tasks, 0) / users.length).toFixed(1) : '0'} 任务/人</div>
              </div>
            </div>
            <div className="score-tile emerald">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">管理员</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">{adminCount}</div>
                <div className="mt-2 text-[11px] text-gray-500">{users.length > 0 ? Math.round(adminCount / users.length * 100) : 0}% 占比</div>
              </div>
            </div>
          </div>

          {/* User list */}
          <div className="panel p-0 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-400" />
                <span className="text-[13px] font-medium text-white">团队成员</span>
                <Badge variant="muted" className="text-[10px]">{users.length} 人</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="p-16 text-center"><Loader2 className="h-6 w-6 text-gray-500 animate-spin inline" /></div>
            ) : users.length === 0 ? (
              <div className="p-16 text-center text-sm text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-3 text-gray-700" />
                还没有用户。
              </div>
            ) : (
              <div>
                <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-white/[0.04]">
                  <div className="col-span-3">用户</div>
                  <div className="col-span-2">角色</div>
                  <div className="col-span-2">任务数</div>
                  <div className="col-span-2">注册时间</div>
                  <div className="col-span-3">最后活跃</div>
                </div>
                {users.map(u => {
                  const isActive = Date.now() - new Date(u.lastActiveAt).getTime() < 24 * 3600 * 1000
                  return (
                    <div key={u.id} className="px-5 py-3.5 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors group border-b border-white/[0.02] last:border-0">
                      <div className="col-span-3 flex items-center gap-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-400/50 to-fuchsia-400/50 border border-white/20 flex items-center justify-center text-[13px] font-bold text-white shadow-lg shadow-indigo-900/30">
                            {u.username.slice(0, 1).toUpperCase()}
                          </div>
                          <div className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#141417]',
                            isActive ? 'bg-emerald-400' : 'bg-gray-600',
                          )} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-white truncate">{u.username}</div>
                          <div className="text-[10px] text-gray-600 truncate">
                            {u.background ? (u.background.length > 30 ? u.background.slice(0, 28) + '…' : u.background) : '未设置背景'}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        {u.role === 'ADMIN'
                          ? <Badge variant="primary"><ShieldCheck className="h-3 w-3" /> 管理员</Badge>
                          : <Badge variant="muted">普通用户</Badge>}
                      </div>
                      <div className="col-span-2">
                        <div className="text-[15px] tabular font-semibold text-white">{u._count.tasks}</div>
                        <div className="text-[10px] text-gray-600">个评估任务</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[12px] text-gray-300 mono">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</div>
                        <div className="text-[10px] text-gray-600">{formatAgo(u.createdAt)}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-[12px] text-gray-300 mono">{new Date(u.lastActiveAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        <div className={cn('text-[10px] flex items-center gap-1', isActive ? 'text-emerald-400' : 'text-gray-500')}>
                          <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: isActive ? '#34d399' : '#6b7280' }} />
                          {formatAgo(u.lastActiveAt)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* === AUDIT TAB === */}
      {tab === 'audit' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="score-tile indigo">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">总调用</span>
                  <Activity className="h-4 w-4 text-indigo-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {auditStats?.totalCalls ?? '—'}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  其中 AI 调用 {auditStats?.aiCalls ?? 0} 次
                </div>
              </div>
            </div>
            <div className="score-tile violet">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">Token 消耗</span>
                  <Zap className="h-4 w-4 text-violet-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {formatNumber((auditStats?.totalTokenInput ?? 0) + (auditStats?.totalTokenOutput ?? 0))}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  输入 {formatNumber(auditStats?.totalTokenInput ?? 0)} / 输出 {formatNumber(auditStats?.totalTokenOutput ?? 0)}
                </div>
              </div>
            </div>
            <div className="score-tile emerald">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">活跃用户</span>
                  <UserCheck className="h-4 w-4 text-emerald-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {auditStats?.activeUsers ?? '—'}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  {auditStats?.range === 'today' ? '今日' : auditStats?.range === '7d' ? '近 7 天' : '近 30 天'}
                </div>
              </div>
            </div>
            <div className="score-tile red">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 mono">失败请求</span>
                  <AlertTriangle className="h-4 w-4 text-red-400/70" />
                </div>
                <div className="display text-4xl tabular text-white leading-none">
                  {auditStats?.errorCalls ?? '—'}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  失败率 {auditStats?.totalCalls ? ((auditStats.errorCalls / auditStats.totalCalls) * 100).toFixed(1) : '0'}%
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="panel p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">时间范围</span>
                <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/10">
                  {(['today', '7d', '30d'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setAuditRange(r)}
                      className={cn(
                        'px-3 h-7 rounded-md text-[11px] font-medium transition-colors',
                        auditRange === r
                          ? 'bg-white/[0.08] text-white'
                          : 'text-gray-500 hover:text-gray-300',
                      )}
                    >
                      {r === 'today' ? '今日' : r === '7d' ? '近 7 天' : '近 30 天'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <Search className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                <select
                  value={auditAction}
                  onChange={e => setAuditAction(e.target.value)}
                  className="flex-1 h-8 bg-white/[0.02] border border-white/10 rounded-lg px-2 text-[12px] text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="">全部操作类型</option>
                  {allActions.map(a => (
                    <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={auditUserId}
                  onChange={e => setAuditUserId(e.target.value)}
                  className="h-8 w-36 bg-white/[0.02] border border-white/10 rounded-lg px-2 text-[12px] text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="">全部用户</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={auditStatus}
                  onChange={e => setAuditStatus(e.target.value)}
                  className="h-8 w-24 bg-white/[0.02] border border-white/10 rounded-lg px-2 text-[12px] text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="">全部状态</option>
                  <option value="success">成功</option>
                  <option value="error">失败</option>
                </select>
              </div>

              <Button variant="ghost" size="sm" onClick={loadAuditLogs}>
                <Loader2 className="h-3 w-3" /> 刷新
              </Button>
            </div>
          </div>

          {/* Audit log table */}
          <div className="panel p-0 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                <span className="text-[13px] font-medium text-white">操作记录</span>
                <Badge variant="muted" className="text-[10px]">共 {auditTotal} 条</Badge>
              </div>
              <div className="text-[11px] text-gray-500 mono">
                第 {auditPage} / {Math.ceil(auditTotal / auditPageSize) || 1} 页
              </div>
            </div>

            {auditLoading ? (
              <div className="p-16 text-center"><Loader2 className="h-6 w-6 text-gray-500 animate-spin inline" /></div>
            ) : auditLogs.length === 0 ? (
              <div className="p-16 text-center text-sm text-gray-500">
                <Activity className="h-10 w-10 mx-auto mb-3 text-gray-700" />
                暂无审计日志
              </div>
            ) : (
              <div>
                <div className="px-5 py-2.5 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-wider text-gray-500 font-semibold border-b border-white/[0.04]">
                  <div className="col-span-2">时间</div>
                  <div className="col-span-2">用户</div>
                  <div className="col-span-2">操作</div>
                  <div className="col-span-2">Token</div>
                  <div className="col-span-1 text-right">耗时</div>
                  <div className="col-span-2">IP / 路径</div>
                  <div className="col-span-1 text-center">状态</div>
                </div>
                {auditLogs.map(log => {
                  const isExpanded = expandedId === log.id
                  return (
                    <div key={log.id} className="border-b border-white/[0.02] last:border-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="w-full px-5 py-3 grid grid-cols-12 gap-3 items-center hover:bg-white/[0.02] transition-colors text-left"
                      >
                        <div className="col-span-2">
                          <div className="text-[12px] text-gray-300 mono">
                            {new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          <div className="text-[10px] text-gray-600 mono">
                            {new Date(log.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        <div className="col-span-2 flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                            {(log.user?.username || '?').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] text-white truncate">{log.user?.username || '（已删除）'}</div>
                            <div className="text-[10px] text-gray-600 truncate">{log.taskId ? '任务: ' + log.taskId.slice(-8) : '—'}</div>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <ActionBadge action={log.action} />
                        </div>
                        <div className="col-span-2">
                          {log.tokenInput || log.tokenOutput ? (
                            <>
                              <div className="text-[12px] tabular text-white">
                                {formatNumber(log.tokenInput || 0)}<span className="text-gray-600"> / {formatNumber(log.tokenOutput || 0)}</span>
                              </div>
                              <div className="text-[10px] text-gray-600">入 / 出</div>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-600">—</span>
                          )}
                        </div>
                        <div className="col-span-1 text-right">
                          <div className="text-[12px] tabular text-gray-300">
                            {log.durationMs !== null ? log.durationMs + 'ms' : '—'}
                          </div>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <div className="text-[11px] text-gray-400 mono truncate">{log.ipAddress || '—'}</div>
                          <div className="text-[10px] text-gray-600 truncate">{log.path || ''}</div>
                        </div>
                        <div className="col-span-1 flex items-center justify-center gap-1">
                          {log.status === 'error'
                            ? <Badge variant="warn" className="text-[10px]">失败</Badge>
                            : <Badge variant="success" className="text-[10px]">成功</Badge>}
                          {isExpanded ? <ChevronUp className="h-3 w-3 text-gray-500" /> : <ChevronDown className="h-3 w-3 text-gray-500" />}
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-5 pb-4 pl-14">
                          <div className="bg-black/30 border border-white/[0.06] rounded-lg p-3 space-y-2">
                            {log.error && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">错误信息</div>
                                <div className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 mono break-all">
                                  {log.error}
                                </div>
                              </div>
                            )}
                            {log.detail && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">详细信息</div>
                                <pre className="text-[11px] text-gray-300 bg-white/[0.02] border border-white/[0.04] rounded px-2 py-1.5 overflow-x-auto mono">
                                  {JSON.stringify(log.detail, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.userAgent && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">User Agent</div>
                                <div className="text-[11px] text-gray-400 bg-white/[0.02] border border-white/[0.04] rounded px-2 py-1.5 mono break-all">
                                  {log.userAgent}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-4 text-[11px] text-gray-500">
                              <span>方法: <span className="text-gray-300 mono">{log.method || '—'}</span></span>
                              <span>路径: <span className="text-gray-300 mono">{log.path || '—'}</span></span>
                              <span>ID: <span className="text-gray-300 mono">{log.id}</span></span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {auditTotal > auditPageSize && (
              <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                <div className="text-[11px] text-gray-500">
                  共 {auditTotal} 条记录
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <span className="text-[11px] text-gray-400 tabular mono">
                    {auditPage} / {Math.ceil(auditTotal / auditPageSize)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={auditPage >= Math.ceil(auditTotal / auditPageSize)}
                    onClick={() => setAuditPage(p => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function formatAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return s <= 0 ? '刚刚' : s + ' 秒前'
  const m = Math.floor(s / 60)
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 30) return d + ' 天前'
  return Math.floor(d / 30) + ' 个月前'
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
