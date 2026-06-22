'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Wand2, Sparkles, Square, AlertCircle, Check, ArrowRight,
  Code2, Bot, ChevronDown, ChevronUp, FileDown, RefreshCw,
  Copy, CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea, Label } from '@/components/ui/input'
import { ThinkBlock } from '@/components/MarkdownView'
import { parseDesignOutput } from '@/lib/design-output'

type TaskType = 'CODING' | 'AGENT'
type Phase = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

interface Props {
  task: any
  onUpdate: (data: any) => void
  onGoToInfo: () => void
}

export default function StepDesign({ task, onUpdate, onGoToInfo }: Props) {
  const [taskType, setTaskType] = useState<TaskType | null>(
    task.requirementType === 'CODING' || task.requirementType === 'AGENT'
      ? task.requirementType
      : null,
  )
  const [userIdea, setUserIdea] = useState('')
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [generatedBackground, setGeneratedBackground] = useState('')
  const [promptThinking, setPromptThinking] = useState('')
  const [promptPhase, setPromptPhase] = useState<Phase>('idle')
  const [promptError, setPromptError] = useState<string | null>(null)
  const [adjustMode, setAdjustMode] = useState(false)
  const [adjustText, setAdjustText] = useState('')
  const [showStarter, setShowStarter] = useState(false)
  const [starterPhase, setStarterPhase] = useState<Phase>('idle')
  const [starterError, setStarterError] = useState<string | null>(null)
  const [starterData, setStarterData] = useState<any>(null)
  const [complexity, setComplexity] = useState<'low' | 'medium' | 'high'>('medium')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const promptAbortRef = useRef<AbortController | null>(null)

  // 如果任务已有 description，预填
  useEffect(() => {
    if (task.description && !generatedPrompt) {
      setGeneratedPrompt(task.description)
    }
    if (task.backgroundUsed && !generatedBackground) {
      setGeneratedBackground(task.backgroundUsed)
    }
  }, [task.description, task.backgroundUsed])

  async function generatePrompt() {
    if (!taskType) return
    const idea = userIdea.trim()
    if (!idea && !adjustMode) return

    setPromptError(null); setPromptPhase('connecting')
    const controller = new AbortController()
    promptAbortRef.current = controller

    try {
      const body: any = { taskType }
      if (adjustMode) {
        body.adjustInstruction = adjustText.trim()
        body.currentPrompt = generatedPrompt
        body.currentBackground = generatedBackground
      } else {
        body.userIdea = idea
      }

      const res = await fetch(`/api/tasks/${task.id}/design/generate-prompt/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '出题服务暂不可用，请稍后重试')
      }
      setPromptPhase('streaming')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      let completed = false
      let finalPrompt = ''
      let finalBackground = ''
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
          try { payload = JSON.parse(dataLine) } catch { continue }
          if (eventName === 'delta' && payload.text) {
            acc += payload.text
            const parsed = parseDesignOutput(acc)
            setGeneratedPrompt(parsed.prompt)
            setGeneratedBackground(parsed.background)
            setPromptThinking(parsed.thinking)
          } else if (eventName === 'error') {
            throw new Error(payload.message || '生成出错')
          } else if (eventName === 'done') {
            completed = true
            finalPrompt = payload.prompt || acc
            finalBackground = payload.background || ''
            setPromptThinking(payload.thinking || parseDesignOutput(payload.full || acc).thinking)
            setGeneratedPrompt(finalPrompt)
            setGeneratedBackground(finalBackground)
            setPromptPhase('done')
            setAdjustMode(false)
            setAdjustText('')
          }
        }
      }
      if (!completed) {
        setPromptPhase('done')
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setPromptPhase(generatedPrompt ? 'done' : 'idle')
      } else {
        setPromptError(e.message || String(e))
        setPromptPhase('error')
      }
    } finally {
      promptAbortRef.current = null
    }
  }

  function abortPrompt() { promptAbortRef.current?.abort() }

  async function copyToClipboard(text: string, field: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(cur => cur === field ? null : cur), 2000)
    } catch {
      // 降级方案
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedField(field)
      setTimeout(() => setCopiedField(cur => cur === field ? null : cur), 2000)
    }
  }

  async function generateStarterCode() {
    if (!taskType) return
    if (!generatedPrompt.trim()) return

    setStarterError(null); setStarterPhase('connecting')
    setStarterData(null)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/api/tasks/${task.id}/design/generate-starter/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          taskPrompt: generatedPrompt,
          taskBackground: generatedBackground,
          complexity,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '起始代码生成服务暂不可用，请稍后重试')
      }
      setStarterPhase('streaming')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
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
          try { payload = JSON.parse(dataLine) } catch { continue }
          if (eventName === 'error') {
            throw new Error(payload.message || '生成出错')
          } else if (eventName === 'done') {
            completed = true
            setStarterData(payload.starter)
            setStarterPhase('done')
          }
        }
      }
      if (!completed) setStarterPhase('error')
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setStarterPhase(starterData ? 'done' : 'idle')
      } else {
        setStarterError(e.message || String(e))
        setStarterPhase('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  function abortStarter() { abortRef.current?.abort() }

  async function downloadStarterZip() {
    if (!starterData?.files?.length) return
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const projectName = starterData.projectName || 'starter-project'
    for (const file of starterData.files) {
      if (file.path && typeof file.content === 'string') {
        zip.file(file.path, file.content)
      }
    }
    if (starterData.readme) {
      zip.file('README.md', starterData.readme)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function confirmAndContinue() {
    if (!generatedPrompt.trim()) return
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: generatedPrompt,
          backgroundUsed: generatedBackground,
          requirementType: taskType,
          currentStep: 'INFO',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存失败，请稍后重试')
      if (data.task) {
        onUpdate(data.task)
        onGoToInfo()
      }
    } catch (e: any) {
      setPromptError(e.message || String(e))
    }
  }

  function skipDesign() {
    onGoToInfo()
  }

  const isPromptWorking = promptPhase === 'connecting' || promptPhase === 'streaming'
  const isStarterWorking = starterPhase === 'connecting' || starterPhase === 'streaming'

  return (
    <div className="space-y-5 animate-rise">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400/20 to-transparent blur-md" />
          <Wand2 className="h-5 w-5 text-amber-300 relative z-10" />
        </div>
        <div className="flex-1">
          <h2 className="display text-xl sm:text-2xl tracking-tight">任务设计</h2>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            选择任务类型，让 AI 辅助你设计高质量的评测题。也可以直接跳过，手动填写。
          </p>
        </div>
        <button
          onClick={skipDesign}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          我已有题目，直接填写 →
        </button>
      </div>

      {/* Task type selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setTaskType('CODING')}
          className={`panel p-4 text-left transition-all ${
            taskType === 'CODING'
              ? 'border-amber-500/40 bg-amber-500/[0.06] ring-1 ring-amber-500/30'
              : 'hover:bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Code2 className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <div className="font-medium text-white">Coding 代码开发</div>
              <div className="text-xs text-gray-500 mt-0.5">修 Bug / 新功能 / 重构 / 工具链</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setTaskType('AGENT')}
          className={`panel p-4 text-left transition-all ${
            taskType === 'AGENT'
              ? 'border-amber-500/40 bg-amber-500/[0.06] ring-1 ring-amber-500/30'
              : 'hover:bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <div className="font-medium text-white">Agent 智能体</div>
              <div className="text-xs text-gray-500 mt-0.5">多工具调用 / 规划推理 / 复杂指令</div>
            </div>
          </div>
        </button>
      </div>

      {!taskType && (
        <div className="panel px-4 py-3 text-sm text-amber-300/80 flex items-start gap-2 border-amber-500/20 bg-amber-500/[0.04]">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>请先选择任务类型，AI 会根据类型采用不同的出题策略和评估标准。</span>
        </div>
      )}

      {taskType && (
        <>
          {/* Idea input */}
          <div className="panel p-5 space-y-3">
            <Label>
              描述一下你想测什么
              <span className="ml-2 text-gray-500 font-normal text-[11px]">可以是几句话、几个关键词、或一个粗糙的想法</span>
            </Label>
            <Textarea
              value={userIdea}
              onChange={e => setUserIdea(e.target.value)}
              rows={4}
              className="bg-white/[0.02] border-white/[0.07]"
              placeholder={
                taskType === 'CODING'
                  ? '例如：我想测一下模型在已有 Next.js 项目中添加用户认证功能的能力，包括登录注册、密码加密、session 管理...'
                  : '例如：我想测一下 Agent 帮我整理用户反馈周报的能力，需要从飞书群获取消息、分类整理、生成文档...'
              }
            />
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500">
                {userIdea.length} 字
              </div>
              <Button
                onClick={generatePrompt}
                loading={isPromptWorking}
                disabled={!userIdea.trim() || isPromptWorking}
                size="sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {promptPhase === 'done' && generatedPrompt ? '重新生成' : 'AI 帮我出题'}
              </Button>
            </div>
          </div>

          {/* Prompt generation status */}
          {isPromptWorking && (
            <div className="panel px-4 py-3 flex items-center gap-3">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
              <span className="text-amber-200 text-[13px] font-medium">
                {promptPhase === 'connecting' ? '正在与模型建立连接...' : 'AI 正在设计题目'}
              </span>
              <span className="text-gray-500 text-[11px] mono ml-auto">
                {generatedPrompt.length} 字
              </span>
              <Button variant="secondary" size="sm" onClick={abortPrompt}>
                <Square className="h-3 w-3 fill-current" /> 停止
              </Button>
            </div>
          )}

          {promptError && (
            <div className="panel px-4 py-3 text-sm text-red-300 flex items-start gap-2 border-red-500/25 bg-red-500/[0.04]">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>生成失败：{promptError}</span>
            </div>
          )}

          {/* Generated prompt preview */}
          {(generatedPrompt || isPromptWorking) && (
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  生成的题目
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {taskType === 'CODING' ? 'Coding' : 'Agent'}
                </Badge>
              </div>

              <div className="space-y-3">
                {promptThinking && (
                  <ThinkBlock content={promptThinking} streaming={isPromptWorking} />
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">任务 Prompt（交给待测模型）</Label>
                    <button
                      onClick={() => copyToClipboard(generatedPrompt, 'prompt')}
                      disabled={!generatedPrompt}
                      className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-40"
                    >
                      {copiedField === 'prompt' ? (
                        <><CheckCheck className="h-3 w-3 text-emerald-400" /> 已复制</>
                      ) : (
                        <><Copy className="h-3 w-3" /> 复制</>
                      )}
                    </button>
                  </div>
                  <Textarea
                    value={generatedPrompt}
                    onChange={e => setGeneratedPrompt(e.target.value)}
                    rows={8}
                    className="mono mt-1.5 text-[13px] bg-white/[0.02] border-white/[0.07] focus:bg-white/[0.03]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">题目来源 / 背景说明</Label>
                    <button
                      onClick={() => copyToClipboard(generatedBackground, 'background')}
                      disabled={!generatedBackground}
                      className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors disabled:opacity-40"
                    >
                      {copiedField === 'background' ? (
                        <><CheckCheck className="h-3 w-3 text-emerald-400" /> 已复制</>
                      ) : (
                        <><Copy className="h-3 w-3" /> 复制</>
                      )}
                    </button>
                  </div>
                  <Textarea
                    value={generatedBackground}
                    onChange={e => setGeneratedBackground(e.target.value)}
                    rows={5}
                    className="mono mt-1.5 text-[13px] bg-white/[0.02] border-white/[0.07] focus:bg-white/[0.03]"
                    placeholder="AI 还没有生成背景说明，你可以手动填写..."
                  />
                </div>
              </div>

              {/* Adjust section */}
              <div className="pt-3 border-t border-white/[0.06]">
                <button
                  onClick={() => setAdjustMode(v => !v)}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  {adjustMode ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {adjustMode ? '收起修改' : '对结果不满意？让 AI 修改'}
                </button>
                {adjustMode && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={adjustText}
                      onChange={e => setAdjustText(e.target.value)}
                      rows={3}
                      className="bg-white/[0.02] border-white/[0.07] text-[13px]"
                      placeholder="例如：把技术栈改成 Vue 3 + TypeScript / 增加一个数据导出功能 / 难度再提高一些..."
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={generatePrompt}
                        loading={isPromptWorking}
                        disabled={!adjustText.trim() || isPromptWorking}
                      >
                        <RefreshCw className="h-3 w-3" /> 修改
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Starter code section */}
          {taskType === 'CODING' && generatedPrompt && (
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-amber-400" />
                    起始代码仓库
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    AI 生成一个起始项目，模拟真实开发中的中间状态
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={complexity}
                    onChange={e => setComplexity(e.target.value as any)}
                    className="text-xs bg-white/[0.05] border border-white/[0.1] rounded-md px-2 py-1 text-gray-300 focus:outline-none"
                    disabled={isStarterWorking}
                  >
                    <option value="low">简单</option>
                    <option value="medium">中等</option>
                    <option value="high">复杂</option>
                  </select>
                  <Button
                    size="sm"
                    onClick={generateStarterCode}
                    loading={isStarterWorking}
                    disabled={isStarterWorking || !generatedPrompt.trim()}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {starterData ? '重新生成' : 'AI 生成'}
                  </Button>
                  {isStarterWorking && (
                    <Button variant="secondary" size="sm" onClick={abortStarter}>
                      <Square className="h-3 w-3 fill-current" />
                    </Button>
                  )}
                </div>
              </div>

              {starterError && (
                <div className="text-sm text-red-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>生成失败：{starterError}</span>
                </div>
              )}

              {isStarterWorking && (
                <div className="flex items-center gap-3 text-sm text-amber-200">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                  正在生成起始代码...（这可能需要 30-60 秒）
                </div>
              )}

              {starterData && starterPhase === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{starterData.projectName}</div>
                      <div className="text-xs text-gray-500">
                        {starterData.files?.length || 0} 个文件
                      </div>
                    </div>
                    <Button size="sm" onClick={downloadStarterZip}>
                      <FileDown className="h-3.5 w-3.5" /> 下载 ZIP
                    </Button>
                  </div>
                  {starterData.readme && (
                    <div className="text-xs text-gray-400 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] max-h-32 overflow-y-auto scrollbar-thin whitespace-pre-wrap">
                      {starterData.readme}
                    </div>
                  )}
                </div>
              )}

              {!starterData && !isStarterWorking && starterPhase === 'idle' && (
                <div className="text-xs text-gray-500 p-4 text-center border border-dashed border-white/10 rounded-lg">
                  点击「AI 生成」让 AI 为你创建一个起始代码项目
                </div>
              )}
            </div>
          )}

          {/* Confirm button */}
          {generatedPrompt && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-gray-500">
                确认后将进入任务信息页面，你可以继续修改和完善
              </div>
              <Button
                onClick={confirmAndContinue}
                disabled={!generatedPrompt.trim()}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-medium"
              >
                <Check className="h-4 w-4" />
                确认并继续
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
