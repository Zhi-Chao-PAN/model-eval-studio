'use client'
import { useRef, RefObject } from 'react'
import { Send, Square, Bot, User, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
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
  onSend: (e: React.FormEvent) => void
  onAbort: () => void
  endRef: RefObject<HTMLDivElement | null>
}

export function ChatPanel({
  currentStepLabel, messages, streamingContent, streaming,
  input, onInputChange, onSend, onAbort, endRef,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  return (
    <Card className="fixed bottom-4 right-4 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] flex flex-col z-30 shadow-2xl shadow-black/50 border border-white/[0.08]">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-br from-indigo-500/10 to-transparent rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">AI 助手</div>
            <div className="text-[10px] text-gray-500">{currentStepLabel}</div>
          </div>
        </div>
        {messages.length > 0 && (
          <Badge variant="default" className="text-[10px]">{messages.length} 条</Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.length === 0 && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2 px-4">
            <MessageSquare className="h-8 w-8 text-slate-300" />
            <div className="text-sm font-medium">有问题随时问我</div>
            <div className="text-xs leading-relaxed">
              我会基于你当前步骤的内容给出建议。可以问我怎么填测试任务、怎么分析产物、怎么写评估报告。
            </div>
          </div>
        )}

        {messages.map(msg => {
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
              {!isUser && (
                <div className="flex-shrink-0 mr-2 mt-1 h-6 w-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
                  <Bot className="h-3 w-3 text-indigo-300" />
                </div>
              )}
              <div className={cn(
                'max-w-[calc(100%-32px)] rounded-xl px-3 py-2 text-sm shadow-sm',
                isUser
                  ? 'bg-indigo-600/90 text-white rounded-tr-sm'
                  : 'bg-white/[0.06] text-white/90 rounded-tl-sm',
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
                <div className="flex-shrink-0 ml-2 mt-1 h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center">
                  <User className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          )
        })}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="flex-shrink-0 mr-2 mt-1 h-6 w-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
              <Bot className="h-3 w-3 text-indigo-300" />
            </div>
            <div className="max-w-[calc(100%-32px)] rounded-xl px-3 py-2 text-sm bg-white/[0.06] text-white/90 rounded-tl-sm shadow-sm">
              <MarkdownView text={streamingContent} compact />
              <JsonTable text={streamingContent} />
              <span className="inline-block w-1.5 h-3.5 bg-blue-500 animate-pulse align-middle ml-0.5" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form onSubmit={onSend} className="p-3 border-t border-white/[0.06]">
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
                onSend(e as any)
              }
            }}
            placeholder="输入消息... (Enter 发送)"
            className="w-full resize-none rounded-lg border border-white/[0.08] px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/60 bg-white/[0.03] focus:bg-white/[0.04] max-h-[100px] scrollbar-thin"
            rows={1}
          />
          <div className="absolute right-1.5 bottom-1.5">
            {streaming ? (
              <Button size="icon-sm" variant="danger" onClick={onAbort} type="button">
                <Square className="h-3 w-3" />
              </Button>
            ) : (
              <Button size="icon-sm" type="submit" disabled={!input.trim()}>
                <Send className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </Card>
  )
}