'use client'
import { useSyncExternalStore } from 'react'

type Listener = () => void

interface Store<T> {
  getState: () => T
  setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void
  subscribe: (l: Listener) => () => void
  api: Record<string, any>
}

export function create<T extends Record<string, any>>(
  factory: (set: (p: Partial<T> | ((s: T) => Partial<T>)) => void, get: () => T) => T,
): {
  useStore: <U>(selector: (s: T) => U) => U
  api: Record<string, any>
} {
  let state: any
  const listeners = new Set<Listener>()

  const setState = (p: any) => {
    const patch = typeof p === 'function' ? p(state) : p
    state = { ...state, ...patch }
    listeners.forEach(l => l())
  }

  const getState = () => state
  const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l) }

  state = factory(setState, getState)

  // bind any functions in state as api
  const api: Record<string, any> = { _set: setState }
  for (const k of Object.keys(state)) {
    const v = (state as any)[k]
    if (typeof v === 'function') api[k] = v
  }

  function useStore<U>(selector: (s: T) => U): U {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
  }

  return { useStore, api }
}