import * as React from 'react'
import { cn } from '@/lib/utils'

const base = cn(
  'w-full bg-white/[0.04] text-white placeholder:text-gray-500',
  'border border-white/[0.08] rounded-lg px-3',
  'focus:outline-none focus:border-indigo-400/60 focus:bg-white/[0.07]',
  'focus:ring-2 focus:ring-indigo-500/20',
  'transition-colors duration-150',
  'disabled:opacity-50 disabled:cursor-not-allowed',
)

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(base, 'h-9 text-sm', className)} {...p} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => (
    <textarea
      ref={ref}
      className={cn(base, 'py-2.5 text-sm leading-relaxed resize-y min-h-[80px]', className)}
      {...p}
    />
  ),
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-gray-300', className)} {...p} />
}

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select
      ref={ref}
      className={cn(base, 'h-9 text-sm cursor-pointer appearance-none pr-8 bg-no-repeat', className)}
      style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")`, backgroundPosition: 'right 10px center' }}
      {...p}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'