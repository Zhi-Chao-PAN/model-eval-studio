import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'success' | 'warn' | 'danger' | 'outline' | 'primary' | 'muted'

const variants: Record<Variant, string> = {
  default: 'bg-white/10 text-white border-white/10',
  primary: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/25',
  success: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20',
  warn: 'bg-amber-500/12 text-amber-300 border-amber-400/20',
  danger: 'bg-red-500/12 text-red-300 border-red-400/20',
  outline: 'text-gray-400 border-white/10 bg-transparent',
  muted: 'bg-white/[0.04] text-gray-400 border-white/5',
}

export function Badge({
  className,
  variant = 'default',
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-2 rounded-md text-[11px] font-medium border whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...p}
    />
  )
}