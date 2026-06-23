'use client'
import {
  FileText, Image as ImageIcon, Package, FileCheck2, ChevronRight, Check,
  Wand2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, any> = {
  DESIGN: Wand2,
  INFO: FileText,
  SCREENSHOT: ImageIcon,
  ARTIFACT: Package,
  REPORT: FileCheck2,
}

// Per-step accent gradient
const ACCENTS: Record<string, string> = {
  DESIGN: 'from-amber-500 to-orange-500',
  INFO: 'from-indigo-500 to-blue-500',
  SCREENSHOT: 'from-fuchsia-500 to-pink-500',
  ARTIFACT: 'from-pink-500 to-rose-500',
  REPORT: 'from-cyan-500 to-blue-500',
}

interface Props {
  steps: readonly { key: string; label: string; desc: string }[]
  currentStep: string
  onChange: (key: string) => void
  completedSteps?: Set<string>
}

export function DesktopStepSidebar({ steps, currentStep, onChange, completedSteps }: Props) {
  const currentIdx = steps.findIndex(s => s.key === currentStep)

  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const Icon = ICONS[step.key] || FileText
        const isCurrent = step.key === currentStep
        const isDone = completedSteps ? completedSteps.has(step.key) : i < currentIdx
        const isFuture = !isCurrent && !isDone
        const accent = ACCENTS[step.key] || 'from-indigo-500 to-violet-500'
        return (
          <button
            key={step.key}
            onClick={() => onChange(step.key)}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all relative',
              isCurrent
                ? 'bg-gradient-to-r from-indigo-500/12 to-fuchsia-500/8 border border-indigo-500/25'
                : 'hover:bg-white/[0.04] border border-transparent',
            )}
          >
            {/* active ring on the right edge */}
            {isCurrent && (
              <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-gradient-to-b from-indigo-400 to-fuchsia-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
            )}
            <div className={cn(
              'flex-shrink-0 mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center transition-all',
              isCurrent ? `bg-gradient-to-br ${accent} text-white shadow-lg shadow-indigo-500/30 animate-step-activate` :
              isDone ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20' :
              'bg-white/[0.05] text-gray-500 border border-white/[0.04]',
            )}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className={cn(
                'text-[13px] font-medium tracking-tight',
                isCurrent ? 'text-white' : isDone ? 'text-gray-200' : 'text-gray-500',
              )}>
                {step.label}
              </div>
              <div className={cn(
                'text-[11px] mt-0.5 truncate',
                isCurrent ? 'text-indigo-300/80' : 'text-gray-500',
              )}>{step.desc}</div>
            </div>
            {isCurrent && (
              <ChevronRight className="h-4 w-4 text-indigo-300 mt-1 flex-shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function MobileStepBar({ steps, currentStep, onChange, completedSteps }: Props) {
  const currentIdx = steps.findIndex(s => s.key === currentStep)
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {steps.map((step, i) => {
        const Icon = ICONS[step.key] || FileText
        const isCurrent = step.key === currentStep
        const isDone = completedSteps ? completedSteps.has(step.key) : i < currentIdx
        return (
          <button
            key={step.key}
            onClick={() => onChange(step.key)}
            className={cn(
              'flex items-center gap-1.5 flex-shrink-0 px-3 h-9 rounded-lg text-xs font-medium transition-colors border',
              isCurrent
                ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white border-transparent shadow-lg shadow-indigo-500/25'
                : isDone
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:border-white/[0.14]',
            )}
          >
            {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3.5 w-3.5" />}
            {step.label}
          </button>
        )
      })}
    </div>
  )
}
