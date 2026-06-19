'use client'
import { useState, useEffect, useRef } from 'react'
import { Brain, Sparkles, Square, AlertCircle, Zap, Lightbulb } from 'lucide-react'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'

interface Props {
  task: any
}

type Phase = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

export default function StepIdea({ task }: Props) {
  const [idea, setIdea] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (task.taskIdeaJson) {
      try {
        const parsed = JSON.parse(task.taskIdeaJson)
        setIdea(parsed.content || '')
        setPhase('done')
      } catch {}
    }
  }, [task.taskIdeaJson])

  useEffect(() => {
    if (phase !== 'connecting' && phase !== 'streaming') return
    const t = setInterval(() => {
      if (startedAt.current) setElapsed((Date.now() - startedAt.current) / 1000)
    }, 100)
    return () => clearInterval(t)
  }, [phase])

  async function generate() {
    setError(null); setIdea(''); setPhase('connecting')
    startedAt.current = Date.now(); setElapsed(0)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/tasks/' + task.id + '/generate-idea/stream', {
        method: 'POST', signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'HTTP ' + res.status)
      }
      setPhase('streaming')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      let completed = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          let eventName = 'message'
          let dataLine = ''
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
          if (eventName === 'delta' && payload.text) {
            acc += payload.text; setIdea(acc)
          } else if (eventName === 'error') {
            throw new Error(payload.message || '生成出错')
          } else if (eventName === 'done') {
            completed = true
            setIdea(payload.full || acc); setPhase('done')
          }
        }
      }
      if (!completed) { setIdea(acc); setPhase('done') }
    } catch (e: any) {
      if (e.name === 'AbortError') setPhase(idea ? 'done' : 'idle')
      else { setError(e.message || String(e)); setPhase('error') }
    } finally { abortRef.current = null }
  }

  function abort() { abortRef.current?.abort() }

  const charCount = idea.length
  const isWorking = phase === 'connecting' || phase === 'streaming'

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-400/20 to-transparent blur-md" />
            <Brain className="h-5 w-5 text-violet-300 relative z-10" />
          </div>
          <div>
            <h2 className="display text-xl sm:text-2xl tracking-tight">测试思路</h2>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">
              AI 基于个人背景与任务来源生成测试思路。流式输出，可中断、可重试。
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {isWorking && (
            <Button variant="secondary" size="sm" onClick={abort}>
              <Square className="h-3 w-3 fill-current" /> 停止
            </Button>
          )}
          <Button onClick={generate} loading={isWorking}>
            <Sparkles className="h-3.5 w-3.5" />
            {phase === 'connecting' && '连接中...'}
            {phase === 'streaming' && 'AI 正在生成'}
            {phase === 'done' && idea && '重新生成'}
            {(phase === 'idle' || (phase === 'done' && !idea) || phase === 'error') && 'AI 生成测试思路'}
          </Button>
        </div>
      </div>

      {isWorking && (
        <div className="panel px-4 py-3 flex items-center gap-3">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
          </span>
          <span className="text-violet-200 text-[13px] font-medium">
            {phase === 'connecting' ? '正在与模型建立连接...' : '正在生成内容'}
          </span>
          <span className="text-gray-500 text-[11px] mono ml-auto">
            {elapsed.toFixed(1)}s · {charCount} 字
          </span>
        </div>
      )}

      {error && (
        <div className="panel px-4 py-3 text-sm text-red-300 flex items-start gap-2 border-red-500/25 bg-red-500/[0.04]">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>生成失败：{error}</span>
        </div>
      )}

      {idea ? (
        <div className="panel p-6 max-h-[600px] overflow-y-auto scrollbar-thin">
          <MarkdownView text={idea} />
          {phase === 'streaming' && (
            <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse align-middle ml-1" />
          )}
        </div>
      ) : !isWorking ? (
        <div className="panel p-10 text-center">
          <div className="relative inline-flex mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 blur-xl rounded-full" />
            <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 border border-white/10 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-violet-300" />
            </div>
          </div>
          <p className="text-[13px] text-gray-400 mb-1">还没有生成测试思路</p>
          <p className="text-[11px] text-gray-600 mb-4">点击右上角按钮，让 AI 基于任务信息生成测试思路</p>
          <Button onClick={generate} size="sm" variant="secondary">
            <Zap className="h-3.5 w-3.5" /> 开始生成
          </Button>
        </div>
      ) : null}
    </div>
  )
}
