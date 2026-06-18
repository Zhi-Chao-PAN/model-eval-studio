'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Download, Trash2, Loader2, Check, ChevronRight,
} from 'lucide-react'
import StepInfo from './StepInfo'
import StepIdea from './StepIdea'
import StepScreenshot from './StepScreenshot'
import StepArtifact from './StepArtifact'
import StepReport from './StepReport'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DesktopStepSidebar, MobileStepBar } from '@/components/tasks/StepSidebar'
import { ChatPanel } from '@/components/chat/ChatPanel'

const STEPS = [
  { key: 'INFO', label: '任务信息', desc: '填写任务基本信息' },
  { key: 'IDEA', label: '测试思路', desc: 'AI 生成测试思路' },
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

export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  const [task, setTask] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState<string>('INFO')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function loadTask() {
    setLoading(true)
    const res = await fetch('/api/tasks/' + taskId)
    let data; try { data = await res.json(); } catch { throw new Error('任务数据接口返回了非预期内容（HTTP ' + res.status + '）') }
    if (data.task) {
      setTask(data.task)
      setCurrentStep(data.task.currentStep || 'INFO')
    } else if (res.status === 404) {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  async function loadMessages() {
    const res = await fetch('/api/tasks/' + taskId + '/messages')
    const data = await res.json()
    if (data.messages) setMessages(data.messages)
  }

  useEffect(() => { loadTask(); loadMessages() }, [taskId])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingContent, currentStep])

  const stepMessages = messages.filter(m => m.step === currentStep)

  function handleTaskUpdate(updated: any) {
    setTask(updated)
    if (updated.currentStep) setCurrentStep(updated.currentStep)
  }

  function handleAddMessage(msg: ChatMessage) {
    setMessages(prev => [...prev, msg])
  }

  function goToStep(stepKey: string) {
    setCurrentStep(stepKey)
    fetch('/api/tasks/' + taskId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentStep: stepKey }),
    }).then(r => r.json()).then(data => { if (data.task) setTask(data.task) })
  }

  async function handleChatSend(e: React.FormEvent) {
    e.preventDefault()
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
          try {
            const payload = JSON.parse(dataLine)
            if (eventName === 'user-message' && payload.message) setMessages(p => [...p, payload.message])
            else if (eventName === 'delta' && payload.text) { acc += payload.text; setStreamingContent(acc) }
            else if (eventName === 'done') {
              if (payload.message) setMessages(p => [...p, payload.message])
              setStreamingContent('')
            } else if (eventName === 'error') throw new Error(payload.message || '对话出错')
          } catch {}
        }
      }
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

  function handleExport() { window.open('/api/tasks/' + taskId + '/export', '_blank') }

  function renderStepContent() {
    if (!task) return null
    switch (currentStep) {
      case 'INFO': return <StepInfo task={task} onUpdate={handleTaskUpdate} />
      case 'IDEA': return <StepIdea task={task} onAddMessage={handleAddMessage} />
      case 'SCREENSHOT': return <StepScreenshot task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />
      case 'ARTIFACT': return <StepArtifact task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />
      case 'REPORT': return <StepReport task={task} onAddMessage={handleAddMessage} onRefresh={loadTask} />
      default: return null
    }
  }
  if (loading) {
    return (
      <div>
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-4 w-1/4 mb-8" />
        <div className="grid grid-cols-12 gap-6">
          <Skeleton className="col-span-3 h-64" />
          <Skeleton className="col-span-9 h-96" />
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-gray-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-[520px] sm:pb-[520px] lg:pb-6 lg:pr-[400px] xl:pr-[420px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors p-1 -ml-1 flex-shrink-0 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="display text-xl sm:text-2xl text-white truncate">
              {task.title || '未命名任务'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5 flex-wrap">
              <Badge variant="muted">{task.models?.length || 0} 个模型</Badge>
              <span>·</span>
              <span className="mono">创建 {new Date(task.createdAt).toLocaleDateString('zh-CN')}</span>
              <span>·</span>
              <span className="mono">更新 {formatTime(task.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> 导出
          </Button>
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

      <div className="lg:hidden mb-4">
        <MobileStepBar steps={STEPS} currentStep={currentStep} onChange={goToStep} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        <aside className="hidden lg:block lg:col-span-3 xl:col-span-2">
          <DesktopStepSidebar steps={STEPS} currentStep={currentStep} onChange={goToStep} />
        </aside>

        <div className="lg:col-span-9 xl:col-span-10 min-w-0">
          <div className="glass p-5 sm:p-6 min-h-[600px]">
            {renderStepContent()}
          </div>
        </div>
      </div>

      <ChatPanel
        currentStepLabel={STEPS.find(s => s.key === currentStep)?.label || ''}
        messages={stepMessages}
        streamingContent={streamingContent}
        streaming={streaming}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={handleChatSend}
        onAbort={abortChat}
        endRef={chatEndRef}
      />
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