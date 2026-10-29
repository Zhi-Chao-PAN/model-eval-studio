'use client'

import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/lib/api-error'

/** Keep each response tied to its request; obsolete requests cannot replace new data. */
export function useAsyncResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0)
  const requestKey = key === null ? null : `${key}:${revision}`
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null)
  useEffect(() => {
    if (requestKey === null) return
    const controller = new AbortController()
    load(controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }) },
      error => { if (!controller.signal.aborted) setResult({ key: requestKey, error: errorMessage(error) }) },
    )
    return () => controller.abort()
  }, [requestKey, load])
  const current = result?.key === requestKey ? result : null
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: requestKey !== null && current === null,
    refresh,
  }
}
