'use client'
import * as React from 'react'
import { create } from '@/components/ui/toast-store'
import { cn } from '@/lib/utils'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface ToastInput { title?: string; message: string; type?: ToastType; duration?: number }
interface ToastItem { id: string; title?: string; message: string; type: ToastType; duration: number }
interface StoreState { toasts: ToastItem[] }

const { useStore, api } = create<StoreState>(() => ({ toasts: [] }))
const setState = (p: any) => (api as any)._set(p)

function push(t: ToastInput) {
  const id = Math.random().toString(36).slice(2)
  const toast: ToastItem = { id, title: t.title, message: t.message, type: t.type || 'info', duration: t.duration ?? 3500 }
  setState((s: StoreState) => ({ toasts: [...s.toasts, toast] }))
  if (toast.duration > 0) setTimeout(() => remove(id), toast.duration)
  return id
}
function remove(id: string) { setState((s: StoreState) => ({ toasts: s.toasts.filter(x => x.id !== id) })) }

export const toast = {
  success: (m: string, o?: any) => push({ message: m, type: 'success', ...o }),
  error: (m: string, o?: any) => push({ message: m, type: 'error', duration: 5000, ...o }),
  info: (m: string, o?: any) => push({ message: m, type: 'info', ...o }),
}

export function Toaster() {
  const toasts = useStore((s: any) => s.toasts)
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t: ToastItem) => {
        const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info
        const color = t.type === 'success' ? 'text-emerald-400' : t.type === 'error' ? 'text-red-400' : 'text-indigo-400'
        return (
          <div key={t.id} className="pointer-events-auto glass-strong px-4 py-3 flex items-start gap-3 animate-rise" role="alert">
            <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', color)} />
            <div className="flex-1 min-w-0">
              {t.title && <div className="text-sm font-semibold text-white">{t.title}</div>}
              <div className="text-sm text-gray-300 leading-relaxed">{t.message}</div>
            </div>
            <button onClick={() => remove(t.id)} aria-label="关闭提示" className="text-gray-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}