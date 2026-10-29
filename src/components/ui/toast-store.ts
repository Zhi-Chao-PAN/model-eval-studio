'use client'
import { useSyncExternalStore } from 'react'

type Listener = () => void
type StateUpdate<T> = Partial<T> | ((state: T) => Partial<T>)

export function create<T extends object>(
  factory: (set: (update: StateUpdate<T>) => void, get: () => T) => T,
) {
  let state: T
  const listeners = new Set<Listener>()
  const setState = (update: StateUpdate<T>) => {
    const patch = typeof update === 'function' ? update(state) : update
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  const getState = () => state
  const subscribe = (listener: Listener) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  state = factory(setState, getState)
  function useStore<U>(selector: (state: T) => U): U {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
  }
  return { useStore, api: { _set: setState } }
}
