import { useCallback, useEffect, useState } from 'react'
import type { AsyncData } from '../dashboard.types'

export function useApiResource<T>(
  enabled: boolean,
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
): AsyncData<T> {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<Omit<AsyncData<T>, 'reload'>>({
    data: null,
    error: null,
    status: enabled ? 'loading' : 'idle',
  })

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, status: 'idle' })
      return
    }
    const controller = new AbortController()
    setState((current) => ({ ...current, error: null, status: 'loading' }))
    void loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, status: 'success' })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ data: null, error: error instanceof Error ? error : new Error('Unknown request error'), status: 'error' })
        }
      })
    return () => controller.abort()
  }, [enabled, key, loader, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  return { ...state, reload }
}
