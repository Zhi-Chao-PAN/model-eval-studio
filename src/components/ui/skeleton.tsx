import { cn } from '@/lib/utils'
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-md bg-white/[0.06] animate-pulse', className)} />
}