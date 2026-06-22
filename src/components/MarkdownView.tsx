'use client'
import { useMemo, useState, useEffect, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, Brain, Loader2 } from 'lucide-react'
import { splitAiContent } from '@/lib/ai-content'

interface Props {
  text: string
  compact?: boolean
}

export function ThinkBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const lineCount = content ? content.split('\n').length : 0
  const charCount = content.length
  const label = streaming
    ? '正在思考'
    : lineCount > 1
      ? `已思考（${charCount} 字 / ${lineCount} 行）`
      : `已思考（${charCount} 字）`

  return (
    <div className="my-3 rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${streaming ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400'}`} />
          <Brain className="h-3 w-3" />
          <span className="font-medium">{label}</span>
        </span>
        <span className="flex items-center gap-1 text-gray-500">
          {streaming && <Loader2 className="h-3 w-3 animate-spin" />}
          <ChevronDown className={'h-3.5 w-3.5 transition-transform ' + (expanded ? 'rotate-180' : '')} />
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2.5 text-xs text-gray-400 whitespace-pre-wrap leading-relaxed border-t border-white/[0.06] bg-black/20 max-h-72 overflow-y-auto scrollbar-thin font-mono">
          {content || '（空）'}
        </div>
      )}
    </div>
  )
}

function MarkdownPart({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={"markdown-body " + (compact ? 'text-sm' : 'text-[15px]') + " text-gray-300 leading-relaxed"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="display text-xl text-white mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold text-white mt-4 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-white mt-3 mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-medium text-gray-200 mt-2.5 mb-1">{children}</h4>,
          p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5 marker:text-gray-500">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5 marker:text-gray-500">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-200">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = (className || '').includes('language-')
            if (isBlock) {
              return (
                <pre className="my-2 p-3 rounded-lg bg-black/60 border border-white/[0.06] text-gray-200 text-xs overflow-x-auto font-mono">
                  <code className={className}>{children}</code>
                </pre>
              )
            }
            return <code className="bg-white/[0.06] border border-white/[0.06] text-indigo-300 px-1 py-0.5 rounded text-[0.85em] font-mono">{children}</code>
          },
          pre: ({ children }) => <>{children}</>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 pl-3 border-l-2 border-indigo-400/40 bg-indigo-500/[0.04] pr-2 py-1.5 text-gray-300 italic rounded-r">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
          th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold text-white border border-white/[0.06]">{children}</th>,
          td: ({ children }) => <td className="px-3 py-1.5 text-gray-300 border border-white/[0.06]">{children}</td>,
          tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
          a: ({ children, href }) => {
            // Only allow known-safe URL schemes to prevent javascript:/data: link injection
            // from AI-generated markdown content.
            const safeHref = typeof href === 'string' && /^(https?:|mailto:|#|\/)/i.test(href)
              ? href
              : '#'
            return (
              <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2">
                {children}
              </a>
            )
          },
          hr: () => <hr className="my-4 border-white/[0.08]" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function MarkdownView({ text, compact, hideThink }: Props & { hideThink?: boolean }): ReactNode {
  const segments = useMemo(() => {
    if (hideThink) return [{ kind: 'text' as const, content: text }]
    return splitAiContent(text || '')
  }, [text, hideThink])

  if (!text) return null

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {segments.map((seg, i) =>
        seg.kind === 'think'
          ? <ThinkBlock key={i} content={seg.content} streaming={seg.open} />
          : <MarkdownPart key={i} text={seg.content} compact={compact} />
      )}
    </div>
  )
}
