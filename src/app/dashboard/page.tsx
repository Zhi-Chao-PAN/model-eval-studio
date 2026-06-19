'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, FlaskConical, FileText, Brain, Image as ImageIcon,
  Package, FileCheck2, Loader2, ArrowRight, Trash2, Circle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

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
}

const STEPS = [
  { key: 'INFO', icon: FileText },
  { key: 'IDEA', icon: Brain },
  { key: 'SCREENSHOT', icon: ImageIcon },
  { key: 'ARTIFACT', icon: Package },
  { key: 'REPORT', icon: FileCheck2 },
] as const

const stepLabels: Record<string, string> = {
  INFO: '任务信息', IDEA: '测试思路', SCREENSHOT: '看板识别', ARTIFACT: '产物分析', REPORT: '评估报告',
}

const statusMeta: Record<string, { label: string; variant: any }> = {
  DRAFT: { label: '草稿', variant: 'muted' },
  IN_PROGRESS: { label: '进行中', variant: 'primary' },
  COMPLETED: { label: '已完成', variant: 'success' },
}

export default function DashboardPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadTasks() {
    try {
      const res = await fetch('/api/tasks')
      let data; try { data = await res.json(); } catch { throw new Error('服务器返回了非预期内容（HTTP ' + res.status + '）') }
      if (data.tasks) setTasks(data.tasks)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadTasks() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      const data = await res.json()
      if (data.task) router.push('/tasks/' + data.task.id)
    } finally { setCreating(false) }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm('确认删除任务「' + title + '」？\\n\\n删除后 30 天内可恢复。')) return
    setDeletingId(id)
    try {
      await fetch('/api/tasks/' + id, { method: 'DELETE' })
      await loadTasks()
    } finally { setDeletingId(null) }
  }

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-3xl sm:text-4xl mb-2">工作台</h1>
          <p className="text-gray-400 text-sm">
            共 <span className="text-white tabular">{tasks.length}</span> 个评估任务
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

      {showNew && (
        <div className="glass-strong p-5 mb-6 animate-rise">
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
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
          </form>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3">
          {[0,1,2].map(i => (
            <div key={i} className="glass p-5">
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
      ) : filtered.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} hasSearch={!!search} />
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const status = statusMeta[task.status] || statusMeta.DRAFT
            const stepIdx = STEPS.findIndex(s => s.key === task.currentStep)
            return (
              <div key={task.id} className="glass p-5 lift group cursor-pointer relative">
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
                      <span>更新 {formatTime(task.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-1">
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
                            {done ? <Circle className="h-2.5 w-2.5 fill-current" /> : <Icon className="h-3 w-3" />}
                          </div>
                          {i < STEPS.length - 1 && (
                            <div className={`w-2 h-px mx-0.5 ${i < stepIdx ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(task.id, task.title) }}
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
    </div>
  )
}

function EmptyState({ onNew, hasSearch }: { onNew: () => void; hasSearch: boolean }) {
  return (
    <div className="glass p-12 text-center">
      <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-white/10 items-center justify-center mb-4">
        <FlaskConical className="h-6 w-6 text-indigo-300" />
      </div>
      {hasSearch ? (
        <>
          <h3 className="text-base font-medium text-white mb-1.5">没有找到匹配的任务</h3>
          <p className="text-sm text-gray-400">试试其他关键词</p>
        </>
      ) : (
        <>
          <h3 className="text-base font-medium text-white mb-1.5">还没有任务</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            创建你的第一个评估任务，上传看板与产物，AI 会帮你生成专业评估报告。
          </p>
          <Button onClick={onNew}><Plus className="h-3.5 w-3.5" /> 创建第一个任务</Button>
        </>
      )}
    </div>
  )
}

function formatTime(s: string) {
  const d = new Date(s)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff/60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff/3600) + ' 小时前'
  if (diff < 604800) return Math.floor(diff/86400) + ' 天前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}