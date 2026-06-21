'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Download, Trash2, Loader2, Check,
  AlertTriangle, Sparkles, X, FileJson, FileSpreadsheet, ChevronDown,
} from 'lucide-react'
import StepInfo from './StepInfo'
import StepScreenshot from './StepScreenshot'
import StepArtifact from './StepArtifact'
import StepReport from './StepReport'
import StepDesign from './StepDesign'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DesktopStepSidebar, MobileStepBar } from '@/components/tasks/StepSidebar'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { filterConversationMessages } from '@/lib/task-messages'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'DESIGN', label: '任务设计', desc: 'AI 辅助设计评测题' },
  { key: 'INFO', label: '任务信息', desc: '确认任务基本信息' },
  { key: 'SCREENSHOT', label: '看板识别', desc: '上传执行过程 & 看板' },
  { key: 'ARTIFACT', label: '产物分析', desc: '上传各模型产物' },
  { key: 'REPORT', label: '评估报告', desc: '生成最终评估报告' },
] as const

interface ChatMessage {
  id: string
  role: string
  content: string
  step: string
  modelId?: string | null
}

function mergeTaskUpdate(previous: unknown, updated: unknown) {
  if (
    typeof previous !== 'object' || previous === null ||
    typeof updated !== 'object' || updated === null
  ) return updated

  const previousTask = previous as Record<string, unknown>
  const updatedTask = updated as Record<string, unknown>

  return {
    ...previousTask,
    ...updatedTask,
    attachments: updatedTask.attachments ?? previousTask.attachments,
    models: updatedTask.models ?? previousTask.models,
    messages: updatedTask.messages ?? previousTask.messages,
  }
}

export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string>('INFO')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const loadTaskSeqRef = useRef(0)

  async function readJsonResponse(res: Response) {
    const text = await res.text().catch(() => '')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { error: text.slice(0, 300) || '接口返回了非预期内容' }
    }
  }

  async function loadTask(options: { forceStep?: string } = {}) {
    const seq = ++loadTaskSeqRef.current
    const showGlobalLoading = task === null
    if (showGlobalLoading) setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/tasks/' + taskId)
      const data = await readJsonResponse(res)
      if (seq !== loadTaskSeqRef.current) return
      if (data.task) {
        setTask(data.task)
        setCurrentStep(options.forceStep || data.task.currentStep || 'INFO')
      } else if (res.status === 404) {
        router.push('/dashboard')
      } else if (!res.ok) {
        setLoadError(data.error || '任务加载失败（HTTP ' + res.status + '）')
      }
    } catch (e: any) {
      setLoadError(e?.message || String(e))
    } finally {
      if (seq === loadTaskSeqRef.current && showGlobalLoading) setLoading(false)
    }
  }

  async function loadMessages() {
    const res = await fetch('/api/tasks/' + taskId + '/messages')
    const data = await readJsonResponse(res)
    if (res.ok && data.messages) setMessages(data.messages)
  }

  useEffect(() => { loadTask(); loadMessages() }, [taskId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent, currentStep, chatOpen])

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!exportMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportMenuOpen])

  const chatMessages = filterConversationMessages(messages, task || {})

  function handleTaskUpdate(updated: any) {
    setTask((previous: unknown) => mergeTaskUpdate(previous, updated))
    if (updated.currentStep) setCurrentStep(updated.currentStep)
  }

  function goToStep(stepKey: string) {
    if (stepKey === currentStep) return
    loadTaskSeqRef.current += 1
    setCurrentStep(stepKey)
    fetch('/api/tasks/' + taskId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStep: stepKey }),
    }).then(readJsonResponse).then(data => {
      if (data.task) setTask((previous: unknown) => mergeTaskUpdate(previous, data.task))
    })
  }

  async function handleChatSend() {
    if (!chatInput.trim() || streaming) return
    const text = chatInput.trim()
    setChatInput(''); setStreaming(true); setStreamingContent('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/tasks/' + taskId + '/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, step: currentStep }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'HTTP ' + res.status)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''; let acc = ''
      let completed = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          let eventName = 'message'; let dataLine = ''
          for (const line of ev.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
          }
          if (!dataLine) continue
          let payload: any
          try {
            payload = JSON.parse(dataLine)
          } catch {
            continue
          }
          if (eventName === 'user-message' && payload.message) setMessages(p => [...p, payload.message])
          else if (eventName === 'delta' && payload.text) { acc += payload.text; setStreamingContent(acc) }
          else if (eventName === 'done') {
            completed = true
            if (payload.message) setMessages(p => [...p, payload.message])
            setStreamingContent('')
          } else if (eventName === 'error') throw new Error(payload.message || '对话出错')
        }
      }
      if (!completed) setStreamingContent('')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(p => [...p, { id: 'err-' + Date.now(), role: 'system', content: '错误: ' + err.message, step: currentStep }])
      }
      setStreamingContent('')
    } finally { setStreaming(false); abortRef.current = null }
  }

  function abortChat() { abortRef.current?.abort() }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      setTimeout(() => setDeleteConfirm(false), 3000)
      return
    }
    await fetch('/api/tasks/' + taskId, { method: 'DELETE' })
    router.push('/dashboard')
  }

  function handleExport(format: 'zip' | 'json' | 'csv') {
    setExportMenuOpen(false)
    window.open('/api/tasks/' + taskId + '/export?format=' + format, '_blank')
  }

  function renderStepContent() {
    if (!task) return null
    switch (currentStep) {
      case 'DESIGN': return <StepDesign task={task} onUpdate={handleTaskUpdate} onGoToInfo={() => goToStep('INFO')} />
      case 'INFO': return <StepInfo task={task} onUpdate={handleTaskUpdate} />
      case 'SCREENSHOT': return <StepScreenshot task={task} onRefresh={() => loadTask({ forceStep: 'SCREENSHOT' })} />
      case 'ARTIFACT': return <StepArtifact task={task} onRefresh={() => loadTask({ forceStep: 'ARTIFACT' })} />
      case 'REPORT': return <StepReport task={task} onRefresh={() => loadTask({ forceStep: 'REPORT' })} />
      default: return null
    }
  }
  if (loading) {
    return (
      <div>
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-4 w-1/4 mb-8" />
        <div className="grid grid-cols-12 gap-6">
          <Skeleton className="col-span-3 h-64 rounded-xl" />
          <Skeleton className="col-span-9 h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!task) {
    if (loadError) {
      return (
        <div className="panel p-8 text-center text-sm text-red-300">
          <AlertTriangle className="h-6 w-6 mx-auto mb-3" />
          <div className="font-medium mb-1">任务加载失败</div>
          <div className="text-gray-400">{loadError}</div>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push('/dashboard')}>
            返回任务列表
          </Button>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-20 lg:pb-6 relative min-h-[80vh]">
      {/* Top header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors p-1.5 -ml-1.5 flex-shrink-0 mt-0 rounded-lg hover:bg-white/5">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="display text-2xl sm:text-3xl text-white tracking-tight truncate">
              {task.title || '未命名任务'}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-2 flex-wrap">
              <span className="mono px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10">
                {task.models?.length || 0} 个模型
              </span>
              <span className="mono px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10">
                创建 {new Date(task.createdAt).toLocaleDateString('zh-CN')}
              </span>
              <span className="mono px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10">
                更新 {formatTime(task.updatedAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
          <div className="relative" ref={exportMenuRef}>
            <Button variant="secondary" size="sm" onClick={() => setExportMenuOpen(v => !v)}>
              <Download className="h-3.5 w-3.5" /> 导出
              <ChevronDown className={cn('h-3 w-3 transition-transform', exportMenuOpen && 'rotate-180')} />
            </Button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-white/10 bg-[#0f0f17] shadow-xl z-30 overflow-hidden">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06] text-left"
                  onClick={() => handleExport('zip')}
                >
                  <Download className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">ZIP 报告包</div>
                    <div className="text-[11px] text-gray-500">所有模型的 TXT 评估报告</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06] text-left border-t border-white/5"
                  onClick={() => handleExport('json')}
                >
                  <FileJson className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">JSON 结构化数据</div>
                    <div className="text-[11px] text-gray-500">任务 + 模型 + 报告完整数据</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-white/[0.06] text-left border-t border-white/5"
                  onClick={() => handleExport('csv')}
                >
                  <FileSpreadsheet className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="font-medium">CSV 横向对比表</div>
                    <div className="text-[11px] text-gray-500">各模型评分一键对比</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <Button
            variant={deleteConfirm ? 'danger' : 'ghost'}
            size="sm"
            onClick={handleDelete}
          >
            {deleteConfirm
              ? <><Check className="h-3.5 w-3.5" /> 再次确认</>
              : <><Trash2 className="h-3.5 w-3.5" /> 删除</>}
          </Button>
        </div>
      </div>

      {/* Mobile step bar */}
      <div className="lg:hidden mb-4">
        <MobileStepBar steps={STEPS} currentStep={currentStep} onChange={goToStep} />
      </div>

      {/* Main grid: sidebar + content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
        <aside className="hidden lg:block lg:col-span-3 xl:col-span-2">
          <DesktopStepSidebar steps={STEPS} currentStep={currentStep} onChange={goToStep} />
        </aside>

        <main className="lg:col-span-9 xl:col-span-10 min-w-0">
          {renderStepContent()}
        </main>
      </div>

      {/* FAB Chat trigger */}
      <button
        onClick={() => setChatOpen(v => !v)}
        className="fab-trigger fixed bottom-6 right-6 z-50"
        aria-label="打开对话助手"
      >
        {chatOpen ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        {streaming && <span className="badge">●</span>}
      </button>

      {/* Chat sheet */}
      {chatOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setChatOpen(false)}
          />
          <div className="sheet z-40">
            <ChatPanel
              currentStepLabel={STEPS.find(s => s.key === currentStep)?.label || ''}
              messages={chatMessages}
              streamingContent={streamingContent}
              streaming={streaming}
              input={chatInput}
              onInputChange={setChatInput}
              onSend={handleChatSend}
              onAbort={abortChat}
              endRef={chatEndRef}
              onClose={() => setChatOpen(false)}
            />
          </div>
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
