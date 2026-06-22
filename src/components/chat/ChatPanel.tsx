'use client'
import { useRef, RefObject } from 'react'
import { Send, Square, Bot, User, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { MarkdownView } from '@/components/MarkdownView'
import { JsonTable } from '@/components/JsonTable'

interface Props {
  currentStepLabel: string
  messages: Array<{ id: string; role: string; content: string; step?: string }>
  streamingContent: string
  streaming: boolean
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  onAbort: () => void
  endRef: RefObject<HTMLDivElement | null>
  onClose?: () => void
}

export function ChatPanel({
  currentStepLabel, messages, streamingContent, streaming,
  input, onInputChange, onSend, onAbort, endRef, onClose,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="flex flex-col w-full h-full bg-transparent flex-1 min-h-0">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-indigo-300" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-white">AI 助手</div>
            <div className="text-[10px] text-gray-500 mono">当前：{currentStepLabel}</div>
          </div>
          {messages.length > 0 && (
            <Badge variant="muted" className="text-[10px] ml-1">{messages.length}</Badge>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition"
            aria-label="关闭对话"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin min-h-0"
        role="log"
        aria-live="polite"
        aria-label="对话消息"
        aria-relevant="additions"
      >
        {messages.length === 0 && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2 px-4 py-8">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-white/10 flex items-center justify-center mb-2">
              <MessageSquare className="h-5 w-5 text-indigo-300/70" />
            </div>
            <div className="text-[13px] font-medium text-gray-300">有问题随时问我</div>
            <div className="text-[11px] leading-relaxed text-gray-500 max-w-xs">
              我会结合整个任务的历史与当前进度回答。可以继续追问任务设计、截图数据、产物分析或评估报告。
            </div>
          </div>
        )}

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
              {!isUser && (
                <div className="flex-shrink-0 mr-2 mt-1 h-6 w-6 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-indigo-300" />
                </div>
              )}
              <div className={cn(
                'max-w-[calc(100%-32px)] rounded-xl px-3 py-2 text-[13px] leading-relaxed',
                isUser
                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-lg shadow-indigo-900/30'
                  : 'bg-white/[0.05] text-white/90 rounded-tl-sm border border-white/[0.06]',
              )}>
                {msg.role === 'system' ? (
                  <div className="text-xs text-red-300">{msg.content}</div>
                ) : (
                  <>
                    <MarkdownView text={msg.content} compact />
                    {!isUser && <JsonTable text={msg.content} />}
                  </>
                )}
              </div>
              {isUser && (
                <div className="flex-shrink-0 ml-2 mt-1 h-6 w-6 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <User className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          )
        })}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="flex-shrink-0 mr-2 mt-1 h-6 w-6 rounded-md bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <Bot className="h-3 w-3 text-indigo-300" />
            </div>
            <div className="max-w-[calc(100%-32px)] rounded-xl px-3 py-2 text-[13px] bg-white/[0.05] text-white/90 rounded-tl-sm border border-white/[0.06]">
              <MarkdownView text={streamingContent} compact />
              <JsonTable text={streamingContent} />
              <span className="inline-block w-1.5 h-3.5 bg-indigo-400 animate-pulse align-middle ml-0.5" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
        className="p-3 border-t border-white/[0.06] flex-shrink-0"
      >
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              onInputChange(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="例如：帮我分析各模型在这个任务上的差异... (Enter 发送)"
            aria-label="AI 助手消息输入框"
            className="w-full resize-none rounded-xl border border-white/[0.08] px-3 py-2.5 pr-12 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/50 bg-white/[0.03] focus:bg-white/[0.05] max-h-[100px] scrollbar-thin transition-colors"
            rows={1}
          />
          <div className="absolute right-1.5 bottom-1.5">
            {streaming ? (
              <Button size="icon-sm" variant="danger" onClick={onAbort} type="button">
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button size="icon-sm" type="submit" disabled={!input.trim()}>
                <Send className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
