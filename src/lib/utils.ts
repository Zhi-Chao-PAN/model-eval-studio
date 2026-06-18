import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('zh-CN', options ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

export function formatDateTime(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}