'use client'
import {
  FileText, Brain, Image as ImageIcon, Package, FileCheck2, ChevronRight, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const ICONS: Record<string, any> = {
  INFO: FileText,
  IDEA: Brain,
  SCREENSHOT: ImageIcon,
  ARTIFACT: Package,
  REPORT: FileCheck2,
}

interface Props {
  steps: readonly { key: string; label: string; desc: string }[]
  currentStep: string
  onChange: (key: string) => void
}

export function DesktopStepSidebar({ steps, currentStep, onChange }: Props) {
  const currentIdx = steps.findIndex(s => s.key === currentStep)

  return (
    <div className="sticky top-20 space-y-1">
      {steps.map((step, i) => {
        const Icon = ICONS[step.key] || FileText
        const isCurrent = step.key === currentStep
        const isDone = i < currentIdx
        const isFuture = i > currentIdx
        return (
          <button
            key={step.key}
            onClick={() => onChange(step.key)}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
              isCurrent
                ? 'bg-indigo-500/10 border border-indigo-500/20 shadow-sm'
                : 'hover:bg-white/[0.06] border border-transparent',
            )}
          >
            <div className={cn(
              'flex-shrink-0 mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center transition-colors',
              isCurrent ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30' :
              isDone ? 'bg-emerald-500/20 text-emerald-300' :
              'bg-white/[0.06] text-gray-500',
            )}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className={cn(
                'text-sm font-medium',
                isCurrent ? 'text-indigo-300' : isDone ? 'text-gray-200' : 'text-gray-500',
              )}>
                {step.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{step.desc}</div>
            </div>
            {isCurrent && (
              <ChevronRight className="h-4 w-4 text-indigo-400 mt-1 flex-shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// Mobile step bar (horizontal scrollable)
export function MobileStepBar({ steps, currentStep, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {steps.map(step => {
        const Icon = ICONS[step.key] || FileText
        const isCurrent = step.key === currentStep
        return (
          <button
            key={step.key}
            onClick={() => onChange(step.key)}
            className={cn(
              'flex items-center gap-1.5 flex-shrink-0 px-3 h-9 rounded-lg text-xs font-medium transition-colors',
              isCurrent
                ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 shadow-sm'
                : 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:border-white/[0.14]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {step.label}
          </button>
        )
      })}
    </div>
  )
}