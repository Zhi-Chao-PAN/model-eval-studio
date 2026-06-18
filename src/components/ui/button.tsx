import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

interface BProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary: cn(
    'relative bg-white text-black font-medium',
    'hover:bg-gray-100 active:bg-gray-200',
    'shadow-[0_0_0_0.5px_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.3)]',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'transition-colors duration-150',
  ),
  secondary: cn(
    'relative bg-white/[0.06] text-white font-medium border border-white/10',
    'hover:bg-white/[0.1] hover:border-white/20',
    'backdrop-blur-sm',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'transition-colors duration-150',
  ),
  ghost: cn(
    'text-gray-300 hover:text-white hover:bg-white/[0.06]',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'transition-colors duration-150',
  ),
  subtle: cn(
    'text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    'transition-colors duration-150',
  ),
  danger: cn(
    'bg-red-500/90 text-white font-medium hover:bg-red-500',
    'shadow-[0_0_0_0.5px_rgba(248,113,113,0.4),0_1px_2px_rgba(0,0,0,0.3)]',
    'disabled:opacity-40',
    'transition-colors duration-150',
  ),
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-6 text-[15px] rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
}

export const Button = React.forwardRef<HTMLButtonElement, BProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap font-medium select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070b]',
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
      </button>
    )
  },
)
Button.displayName = 'Button'