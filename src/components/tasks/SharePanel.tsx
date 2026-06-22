'use client'

import { useState, useEffect } from 'react'
import {
  X, Users, Link2, Copy, Check, Plus, Trash2, ExternalLink,
  Clock, Shield, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'

interface Props {
  taskId: string
  onClose: () => void
}

interface Collaborator {
  id: string
  userId: string
  role: string
  user: { id: string; username: string } | null
  createdAt: string
}

interface Share {
  id: string
  token: string
  accessType: string
  expiresAt: string | null
  createdAt: string
}

type Tab = 'collaborators' | 'shares'

export function SharePanel({ taskId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('collaborators')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addUsername, setAddUsername] = useState('')
  const [addRole, setAddRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [creatingShare, setCreatingShare] = useState(false)
  const [expiresDays, setExpiresDays] = useState('7')
  const [actingUserId, setActingUserId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(null)
  const [confirmRevokeShare, setConfirmRevokeShare] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [taskId, activeTab])

  function flashSuccess(msg: string) {
    setActionSuccess(msg)
    setActionError(null)
    setTimeout(() => setActionSuccess(null), 2500)
  }
  function flashError(msg: string) {
    setActionError(msg)
    setActionSuccess(null)
  }

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      if (activeTab === 'collaborators') {
        const res = await fetch('/api/tasks/' + taskId + '/collaborators')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '加载协作者列表失败，请稍后重试')
        setCollaborators(data.collaborators || [])
      } else {
        const res = await fetch('/api/tasks/' + taskId + '/shares')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '加载共享链接失败，请稍后重试')
        setShares(data.shares || [])
      }
    } catch (e: any) {
      setLoadError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function addCollaborator() {
    const username = addUsername.trim()
    if (!username) {
      flashError('请输入用户名')
      return
    }
    setAdding(true)
    setActionError(null)
    try {
      const res = await fetch('/api/tasks/' + taskId + '/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: addRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        flashError(data.error || '添加失败，请稍后重试')
        return
      }
      setAddUsername('')
      flashSuccess('已添加协作者 ' + username)
      loadData()
    } catch (e: any) {
      flashError(e?.message || '添加失败，请检查网络连接')
    } finally {
      setAdding(false)
    }
  }

  async function updateRole(userId: string, role: string) {
    setActingUserId(userId)
    setActionError(null)
    try {
      const res = await fetch('/api/tasks/' + taskId + '/collaborators/' + userId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        flashError(data.error || '角色更新失败，请稍后重试')
        return
      }
      flashSuccess('角色已更新')
      loadData()
    } catch (e: any) {
      flashError(e?.message || '角色更新失败，请检查网络连接')
    } finally {
      setActingUserId(null)
    }
  }

  function promptRemoveCollaborator(userId: string) {
    setConfirmRemoveUser(userId)
  }

  async function confirmRemoveCollaborator() {
    const userId = confirmRemoveUser
    if (!userId) return
    setConfirmRemoveUser(null)
    setActingUserId(userId)
    setActionError(null)
    try {
      const res = await fetch('/api/tasks/' + taskId + '/collaborators/' + userId, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        flashError(data.error || '移除失败，请稍后重试')
        return
      }
      flashSuccess('协作者已移除')
      loadData()
    } catch (e: any) {
      flashError(e?.message || '移除失败，请检查网络连接')
    } finally {
      setActingUserId(null)
    }
  }

  async function createShare() {
    setCreatingShare(true)
    setActionError(null)
    try {
      const days = Number(expiresDays)
      const res = await fetch('/api/tasks/' + taskId + '/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessType: 'VIEW',
          expiresInDays: days > 0 ? days : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        flashError(data.error || '创建共享链接失败，请稍后重试')
        return
      }
      flashSuccess('共享链接已创建')
      loadData()
    } catch (e: any) {
      flashError(e?.message || '创建失败，请检查网络连接')
    } finally {
      setCreatingShare(false)
    }
  }

  function promptRevokeShare(shareId: string) {
    setConfirmRevokeShare(shareId)
  }

  async function confirmRevokeShareAction() {
    const shareId = confirmRevokeShare
    if (!shareId) return
    setConfirmRevokeShare(null)
    setRevokingId(shareId)
    setActionError(null)
    try {
      const res = await fetch('/api/tasks/' + taskId + '/shares/' + shareId, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        flashError(data.error || '吊销链接失败，请稍后重试')
        return
      }
      flashSuccess('共享链接已吊销')
      loadData()
    } catch (e: any) {
      flashError(e?.message || '吊销失败，请检查网络连接')
    } finally {
      setRevokingId(null)
    }
  }

  function copyShareUrl(token: string) {
    const url = window.location.origin + '/share/' + token
    const done = () => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done))
    } else {
      fallbackCopy(url, done)
    }
  }

  function fallbackCopy(text: string, cb: () => void) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      cb()
    } catch {
      flashError('复制失败，请手动复制：' + text)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="panel w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-indigo-300" />
            </div>
            <h3 className="font-medium">共享设置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.07]">
          <button
            onClick={() => setActiveTab('collaborators')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === 'collaborators' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Users className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            协作者
            {activeTab === 'collaborators' && (
              <div className="absolute bottom-0 left-4 right-4 h-px bg-indigo-400" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('shares')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === 'shares' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Link2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            公开链接
            {activeTab === 'shares' && (
              <div className="absolute bottom-0 left-4 right-4 h-px bg-indigo-400" />
            )}
          </button>
        </div>

        {/* Flash messages */}
        {(actionError || actionSuccess) && (
          <div className={cn(
            'px-4 py-2 text-sm flex items-center gap-2 border-b',
            actionError
              ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
          )}>
            {actionError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            <span className="flex-1">{actionError || actionSuccess}</span>
            <button
              onClick={() => { setActionError(null); setActionSuccess(null) }}
              className="text-current opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-sm text-gray-500 py-8">加载中...</div>
          ) : loadError ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 mx-auto text-amber-400 mb-2" />
              <p className="text-sm text-amber-200 mb-3">{loadError}</p>
              <Button size="sm" variant="secondary" onClick={loadData}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重试
              </Button>
            </div>
          ) : activeTab === 'collaborators' ? (
            <div className="space-y-4">
              {/* Add collaborator */}
              <div className="space-y-2">
                <Label>添加协作者</Label>
                <div className="flex gap-2">
                  <Input
                    value={addUsername}
                    onChange={e => setAddUsername(e.target.value)}
                    placeholder="输入对方注册时使用的用户名"
                    className="bg-white/[0.02] border-white/[0.07] flex-1"
                    onKeyDown={e => { if (e.key === 'Enter') addCollaborator() }}
                  />
                  <select
                    value={addRole}
                    onChange={e => setAddRole(e.target.value as 'VIEWER' | 'EDITOR')}
                    className="bg-white/[0.02] border border-white/[0.07] rounded-lg px-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  >
                    <option value="VIEWER" className="bg-[#0f0f17]">查看者</option>
                    <option value="EDITOR" className="bg-[#0f0f17]">编辑者</option>
                  </select>
                  <Button size="sm" onClick={addCollaborator} loading={adding}>
                    <Plus className="h-3.5 w-3.5" /> 添加
                  </Button>
                </div>
              </div>

              {/* Collaborator list */}
              <div className="space-y-1.5">
                {collaborators.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-6 space-y-1">
                    <p>暂无协作者，添加用户来共享此任务</p>
                    <p className="text-xs text-gray-600">
                      输入对方注册时使用的用户名即可添加。协作者登录后会在工作台的「与我共享」中看到此任务。
                    </p>
                  </div>
                ) : (
                  collaborators.map(c => {
                    const username = c.user?.username
                    const initial = username ? username.charAt(0).toUpperCase() : '?'
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                      >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-indigo-200">{initial}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {username || <span className="text-gray-500 italic">已注销用户</span>}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {c.role === 'EDITOR' ? '可编辑' : '仅查看'}
                          </div>
                        </div>
                        <select
                          value={c.role}
                          disabled={actingUserId === c.userId}
                          onChange={e => updateRole(c.userId, e.target.value)}
                          className="bg-white/[0.02] border border-white/[0.07] rounded-md px-2 py-1 text-xs text-gray-300 focus:outline-none disabled:opacity-50"
                        >
                          <option value="VIEWER" className="bg-[#0f0f17]">查看者</option>
                          <option value="EDITOR" className="bg-[#0f0f17]">编辑者</option>
                        </select>
                        <button
                          onClick={() => promptRemoveCollaborator(c.userId)}
                          disabled={actingUserId === c.userId}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400 disabled:opacity-50"
                          title="移除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="text-[11px] text-gray-500 pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <Shield className="h-3 w-3" /> 权限说明
                </div>
                <ul className="space-y-0.5 pl-4 list-disc">
                  <li>查看者：可以查看任务详情、模型、报告，不能修改</li>
                  <li>编辑者：可以修改任务信息、上传产物、生成报告</li>
                  <li>只有任务创建者可以管理协作者和共享链接</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Create share */}
              <div className="space-y-2">
                <Label>创建公开链接</Label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">有效期</span>
                    <select
                      value={expiresDays}
                      onChange={e => setExpiresDays(e.target.value)}
                      className="bg-white/[0.02] border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-gray-300 flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      <option value="1" className="bg-[#0f0f17]">1 天</option>
                      <option value="7" className="bg-[#0f0f17]">7 天</option>
                      <option value="30" className="bg-[#0f0f17]">30 天</option>
                      <option value="0" className="bg-[#0f0f17]">永久</option>
                    </select>
                  </div>
                  <Button size="sm" onClick={createShare} loading={creatingShare}>
                    <Plus className="h-3.5 w-3.5" /> 创建
                  </Button>
                </div>
              </div>

              {/* Share list */}
              <div className="space-y-1.5">
                {shares.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-6 space-y-1">
                    <p>暂无共享链接，创建后可分享给任何人查看</p>
                    <p className="text-xs text-gray-600">公开链接为只读权限，可随时吊销。</p>
                  </div>
                ) : (
                  shares.map(s => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                        <code className="text-xs text-indigo-300 flex-1 truncate">/share/{s.token}</code>
                        <button
                          onClick={() => copyShareUrl(s.token)}
                          className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 flex-shrink-0"
                          title="复制链接"
                          aria-label={copiedToken === s.token ? '已复制链接' : '复制共享链接'}
                        >
                          {copiedToken === s.token
                            ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a
                          href={`/share/${s.token}`}
                          target="_blank"
                          rel="noopener,noreferrer"
                          className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-indigo-300 flex-shrink-0"
                          title="打开链接预览"
                          aria-label="打开共享链接预览"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => promptRevokeShare(s.id)}
                          disabled={revokingId === s.id}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400 flex-shrink-0 disabled:opacity-50"
                          title="吊销"
                          aria-label="吊销此共享链接"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {s.expiresAt
                            ? '过期：' + new Date(s.expiresAt).toLocaleDateString('zh-CN')
                            : '永不过期'}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">只读</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="text-[11px] text-gray-500 pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <Shield className="h-3 w-3" /> 安全说明
                </div>
                <ul className="space-y-0.5 pl-4 list-disc">
                  <li>公开链接任何人都可以查看任务内容，仅限分享给可信人员</li>
                  <li>可以随时吊销链接，吊销后立即失效</li>
                  <li>公开链接只有只读权限，不能修改任何内容</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remove Collaborator Confirmation */}
      <ConfirmDialog
        open={!!confirmRemoveUser}
        title="移除协作者"
        message={confirmRemoveUser ? '确定移除该协作者？移除后该用户将无法再访问此任务。' : ''}
        confirmText="确认移除"
        cancelText="取消"
        variant="danger"
        loading={!!(confirmRemoveUser && actingUserId === confirmRemoveUser)}
        onConfirm={confirmRemoveCollaborator}
        onCancel={() => setConfirmRemoveUser(null)}
      />

      {/* Revoke Share Confirmation */}
      <ConfirmDialog
        open={!!confirmRevokeShare}
        title="吊销共享链接"
        message={confirmRevokeShare ? '确定吊销此共享链接？吊销后将无法通过该链接访问本任务。' : ''}
        confirmText="确认吊销"
        cancelText="取消"
        variant="warning"
        loading={!!(confirmRevokeShare && revokingId === confirmRevokeShare)}
        onConfirm={confirmRevokeShareAction}
        onCancel={() => setConfirmRevokeShare(null)}
      />
    </div>
  )
}
