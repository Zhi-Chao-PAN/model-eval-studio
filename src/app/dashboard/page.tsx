'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, FlaskConical, FileText, Image as ImageIcon, Wand2,
  Package, FileCheck2, Loader2, ArrowRight, Trash2,
  AlertTriangle, RefreshCw, Lightbulb, Code2, Bot, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { cn, formatRelativeTime } from '@/lib/utils'

interface Task {
  id: string
  title: string
  category: string | null
  requirementType: string | null
  status: string
  currentStep: string
  createdAt: string
  updatedAt: string
  _count: { models: number }
  role?: string
  user?: { username: string }
}

const STEPS = [
  { key: 'DESIGN', icon: Wand2 },
  { key: 'INFO', icon: FileText },
  { key: 'SCREENSHOT', icon: ImageIcon },
  { key: 'ARTIFACT', icon: Package },
  { key: 'REPORT', icon: FileCheck2 },
] as const

const stepLabels: Record<string, string> = {
  DESIGN: '任务设计', INFO: '任务信息', SCREENSHOT: '看板识别', ARTIFACT: '产物分析', REPORT: '评估报告',
}

const statusMeta: Record<string, { label: string; variant: any }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  IN_PROGRESS: { label: '进行中', variant: 'primary' },
  COMPLETED: { label: '已完成', variant: 'success' },
}

export default function DashboardPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [sharedTasks, setSharedTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<'CODING' | 'AGENT'>('CODING')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'mine' | 'shared'>('mine')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null)

  async function loadTasks() {
    setLoadError(null)
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) {
        let msg = '加载任务失败，请稍后重试'
        try { const d = await res.json(); if (d.error) msg = d.error } catch { /* ignore */ }
        throw new Error(msg)
      }
      let data
      try { data = await res.json() } catch { throw new Error('服务器返回了非预期内容') }
      if (data.tasks) setTasks(data.tasks)
      if (data.sharedTasks) setSharedTasks(data.sharedTasks)
    } catch (e: any) {
      setLoadError(e?.message || '加载任务失败，请检查网络连接后重试')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadTasks() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setActionError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), category: newCategory }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.task) {
        setActionError(data.error || '创建任务失败，请稍后重试')
        return
      }
      router.push('/tasks/' + data.task.id)
    } catch (err: any) {
      setActionError(err?.message || '创建任务失败，请检查网络连接')
    } finally { setCreating(false) }
  }

  async function handleDeleteClick(id: string, title: string) {
    setConfirmDelete({ id, title })
  }

  async function confirmDeleteTask() {
    if (!confirmDelete) return
    const { id } = confirmDelete
    setDeletingId(id)
    setActionError(null)
    setConfirmDelete(null)
    try {
      const res = await fetch('/api/tasks/' + id, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error || '删除失败，请稍后重试')
        return
      }
      await loadTasks()
    } catch (err: any) {
      setActionError(err?.message || '删除失败，请检查网络连接')
    } finally { setDeletingId(null) }
  }

  const displayTasks = activeTab === 'mine' ? tasks : sharedTasks
  const filtered = displayTasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-3xl sm:text-4xl mb-2">工作台</h1>
          <p className="text-gray-400 text-sm">
            共 <span className="text-white tabular">{tasks.length}</span> 个任务
            {sharedTasks.length > 0 && (
              <> · <span className="text-white tabular">{sharedTasks.length}</span> 个共享</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索任务..." className="pl-8 w-56" />
          </div>
          <Button onClick={() => setShowNew(v => !v)}>
            <Plus className="h-3.5 w-3.5" /> 新建任务
          </Button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-white/[0.02] w-fit">
        <button
          onClick={() => setActiveTab('mine')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            activeTab === 'mine'
              ? 'bg-white/[0.06] text-white'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          我的任务 ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('shared')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            activeTab === 'shared'
              ? 'bg-white/[0.06] text-white'
              : 'text-gray-500 hover:text-gray-300'
          )}
        >
          与我共享 ({sharedTasks.length})
        </button>
      </div>

      {showNew && (
        <div className="panel p-5 mb-6 animate-rise">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowNew(false); setNewTitle('') } }}
                  placeholder="输入新任务名称，例如：作品集项目方向决策评估"
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowNew(false); setNewTitle('') }}>取消</Button>
                <Button type="submit" size="sm" loading={creating} disabled={!newTitle.trim()}>
                  创建并进入 <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 flex-shrink-0">任务类型：</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewCategory('CODING')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    newCategory === 'CODING'
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                      : 'border-white/10 text-gray-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" /> 编程类
                </button>
                <button
                  type="button"
                  onClick={() => setNewCategory('AGENT')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    newCategory === 'AGENT'
                      ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200'
                      : 'border-white/10 text-gray-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" /> Agent 类
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {actionError && (
        <div className="mb-4 panel p-3 border-red-500/30 bg-red-500/5 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400/70 hover:text-red-300 text-xs">关闭</button>
        </div>
      )}

      {loadError && !loading && (
        <div className="panel p-6 border-amber-500/30 bg-amber-500/5 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-400 mb-2" />
          <p className="text-sm text-amber-200 mb-3">{loadError}</p>
          <Button size="sm" variant="secondary" onClick={() => { setLoading(true); loadTasks() }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重试
          </Button>
        </div>
      )}

      {loading ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="h-3 w-3 text-gray-500 animate-spin" />
            <span className="text-xs text-gray-500">正在加载任务列表...</span>
          </div>
          <div className="grid gap-3">
            {[0,1,2].map(i => (
              <div key={i} className="panel p-5">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-white/5 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse" />
                    <div className="h-3 w-1/5 rounded bg-white/5 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : loadError ? null : filtered.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} hasSearch={!!search} />
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const status = statusMeta[task.status] || statusMeta.DRAFT
            const stepIdx = STEPS.findIndex(s => s.key === task.currentStep)
            return (
              <div key={task.id} className="panel p-4 group cursor-pointer relative transition-transform hover:-translate-y-0.5">
                <Link href={'/tasks/' + task.id} className="absolute inset-0" />
                <div className="flex items-center gap-4 relative pointer-events-none">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <FlaskConical className="h-4 w-4 text-indigo-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-white truncate group-hover:text-indigo-200 transition-colors">{task.title}</h3>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant="muted">{stepLabels[task.currentStep] || task.currentStep}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{task._count?.models || 0} 个模型</span>
                      <span>·</span>
                      <span>更新 {formatRelativeTime(task.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {STEPS.map((s, i) => {
                      const Icon = s.icon
                      const done = i < stepIdx
                      const current = i === stepIdx
                      return (
                        <div key={s.key} className="flex items-center">
                          <div className={`h-6 w-6 rounded-md flex items-center justify-center transition-colors ${
                            done ? 'bg-emerald-500/15 text-emerald-400' :
                            current ? 'bg-indigo-500/20 text-indigo-300' :
                            'bg-white/[0.03] text-gray-600'
                          }`}>
                            {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                          </div>
                          {i < STEPS.length - 1 && (
                            <div className={`w-2 h-px mx-0.5 ${i < stepIdx ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteClick(task.id, task.title) }}
                    disabled={deletingId === task.id}
                    className="pointer-events-auto p-1.5 rounded-md text-gray-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    {deletingId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                  <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除任务"
        message={confirmDelete ? `确定要删除任务「${confirmDelete.title}」吗？\n此操作不可恢复，所有关联的评估数据将一并删除。` : ''}
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        loading={!!deletingId}
        onConfirm={confirmDeleteTask}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function EmptyState({ onNew, hasSearch }: { onNew: () => void; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="panel p-12 text-center">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/10 items-center justify-center mb-4">
          <Search className="h-6 w-6 text-gray-500" />
        </div>
        <h3 className="text-base font-medium text-white mb-1.5">没有找到匹配的任务</h3>
        <p className="text-sm text-gray-400">试试其他关键词</p>
      </div>
    )
  }

  const quickSteps = [
    { icon: Wand2, label: '设计评测题', desc: 'AI 辅助生成评分维度' },
    { icon: ImageIcon, label: '上传截图', desc: '自动提取硬指标' },
    { icon: Package, label: '添加产物', desc: '各模型输出文件' },
    { icon: FileCheck2, label: '生成报告', desc: '结构化对比评估' },
  ]

  return (
    <div className="panel p-8 sm:p-12">
      <div className="max-w-2xl mx-auto text-center">
        <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 items-center justify-center mb-5">
          <FlaskConical className="h-7 w-7 text-indigo-300" />
        </div>
        <h3 className="text-xl font-medium text-white mb-2">开始你的第一次模型评估</h3>
        <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
          创建评估任务，上传看板截图与模型产物，AI 将自动完成指标提取、横向对比、评分和报告生成。
        </p>

        {/* Quick workflow preview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {quickSteps.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="panel-inset p-3 text-center">
                <div className="inline-flex h-8 w-8 rounded-lg bg-white/[0.04] items-center justify-center mb-2">
                  <Icon className="h-4 w-4 text-indigo-300" />
                </div>
                <div className="text-[12px] font-medium text-white mb-0.5">{s.label}</div>
                <div className="text-[11px] text-gray-500">{s.desc}</div>
              </div>
            )
          })}
        </div>

        {/* Tips */}
        <div className="flex items-start gap-2 panel-inset p-3 mb-8 text-left">
          <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-gray-400 leading-relaxed">
            <span className="text-gray-300 font-medium">小提示：</span>
            创建任务后，你可以随时通过右下角的 AI 助手获取帮助。每个步骤都有详细引导，无需担心不知道如何操作。
          </div>
        </div>

        <Button onClick={onNew} size="lg">
          <Plus className="h-4 w-4 mr-1" /> 创建第一个任务
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
