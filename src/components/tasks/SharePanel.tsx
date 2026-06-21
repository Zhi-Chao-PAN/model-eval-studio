'use client'

import { useState, useEffect } from 'react'
import {
  X, Users, Link2, Copy, Check, Plus, Trash2,
  Clock, Shield, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  taskId: string
  onClose: () => void
}

interface Collaborator {
  id: string
  userId: string
  role: string
  user: { id: string; username: string; role: string }
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
  const [addUsername, setAddUsername] = useState('')
  const [addRole, setAddRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER')
  const [adding, setAdding] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [creatingShare, setCreatingShare] = useState(false)
  const [expiresDays, setExpiresDays] = useState('7')

  useEffect(() => {
    loadData()
  }, [taskId, activeTab])

  async function loadData() {
    setLoading(true)
    try {
      if (activeTab === 'collaborators') {
        const res = await fetch('/api/tasks/' + taskId + '/collaborators')
        const data = await res.json()
        if (data.collaborators) setCollaborators(data.collaborators)
      } else {
        const res = await fetch('/api/tasks/' + taskId + '/shares')
        const data = await res.json()
        if (data.shares) setShares(data.shares)
      }
    } catch (e) {
      console.error('加载共享数据失败', e)
    } finally {
      setLoading(false)
    }
  }

  async function addCollaborator() {
    if (!addUsername.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/tasks/' + taskId + '/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername.trim(), role: addRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '添加失败')
        return
      }
      setAddUsername('')
      loadData()
    } finally {
      setAdding(false)
    }
  }

  async function updateRole(userId: string, role: string) {
    const res = await fetch('/api/tasks/' + taskId + '/collaborators/' + userId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) loadData()
  }

  async function removeCollaborator(userId: string) {
    if (!confirm('确定移除该协作者？')) return
    const res = await fetch('/api/tasks/' + taskId + '/collaborators/' + userId, {
      method: 'DELETE',
    })
    if (res.ok) loadData()
  }

  async function createShare() {
    setCreatingShare(true)
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
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '创建失败')
        return
      }
      loadData()
    } finally {
      setCreatingShare(false)
    }
  }

  async function revokeShare(shareId: string) {
    if (!confirm('确定吊销此共享链接？吊销后将无法通过该链接访问。')) return
    const res = await fetch('/api/tasks/' + taskId + '/shares/' + shareId, {
      method: 'DELETE',
    })
    if (res.ok) loadData()
  }

  function copyShareUrl(token: string) {
    const url = window.location.origin + '/share/' + token
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="panel w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-sm text-gray-500 py-8">加载中...</div>
          ) : activeTab === 'collaborators' ? (
            <div className="space-y-4">
              {/* Add collaborator */}
              <div className="space-y-2">
                <Label>添加协作者</Label>
                <div className="flex gap-2">
                  <Input
                    value={addUsername}
                    onChange={e => setAddUsername(e.target.value)}
                    placeholder="输入用户名"
                    className="bg-white/[0.02] border-white/[0.07] flex-1"
                    onKeyDown={e => {
                      if (e.key === 'Enter') addCollaborator()
                    }}
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
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>
              </div>

              {/* Collaborator list */}
              <div className="space-y-1.5">
                {collaborators.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-6">
                    暂无协作者，添加用户来共享此任务
                  </div>
                ) : (
                  collaborators.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-indigo-200">
                          {c.user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.user.username}</div>
                        <div className="text-[11px] text-gray-500">
                          {c.role === 'EDITOR' ? '可编辑' : '仅查看'}
                        </div>
                      </div>
                      <select
                        value={c.role}
                        onChange={e => updateRole(c.userId, e.target.value)}
                        className="bg-white/[0.02] border border-white/[0.07] rounded-md px-2 py-1 text-xs text-gray-300 focus:outline-none"
                      >
                        <option value="VIEWER" className="bg-[#0f0f17]">查看者</option>
                        <option value="EDITOR" className="bg-[#0f0f17]">编辑者</option>
                      </select>
                      <button
                        onClick={() => removeCollaborator(c.userId)}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                        title="移除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="text-[11px] text-gray-500 pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <Shield className="h-3 w-3" />
                  权限说明
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
                    <Plus className="h-3.5 w-3.5" />
                    创建
                  </Button>
                </div>
              </div>

              {/* Share list */}
              <div className="space-y-1.5">
                {shares.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-6">
                    暂无共享链接，创建后可分享给任何人查看
                  </div>
                ) : (
                  shares.map(s => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                        <code className="text-xs text-indigo-300 flex-1 truncate">
                          /share/{s.token}
                        </code>
                        <button
                          onClick={() => copyShareUrl(s.token)}
                          className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 flex-shrink-0"
                          title="复制链接"
                        >
                          {copiedToken === s.token
                            ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                            : <Copy className="h-3.5 w-3.5" />
                          }
                        </button>
                        <button
                          onClick={() => revokeShare(s.id)}
                          className="p-1.5 rounded-md hover:bg-red-500/10 text-gray-500 hover:text-red-400 flex-shrink-0"
                          title="吊销"
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
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          只读
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="text-[11px] text-gray-500 pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-1 mb-1">
                  <Shield className="h-3 w-3" />
                  安全说明
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
    </div>
  )
}
