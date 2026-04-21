import { useCallback, useEffect, useRef, useState } from 'react'

export interface UpdatePatch {
  [field: string]: unknown
}

export interface UpdateResult {
  ok: boolean
  error?: string
}

export interface UseInlineUpdateResult<P extends UpdatePatch> {
  /** Call to attempt a field update. Returns the upstream result. On
   * failure, flashes the row id for `flashMs` and returns the error. */
  commit: (id: string, patch: P) => Promise<UpdateResult>
  /** True when the row most recently failed to commit and the flash
   * hasn't decayed yet. */
  isFailed: (id: string) => boolean
  /** Most recent error message for this id (for tooltip / copy). */
  errorFor: (id: string) => string | undefined
  /** Clear any stored error (e.g. on drawer close). */
  clear: (id?: string) => void
}

interface UseInlineUpdateOptions {
  /** Duration of the row flash after a failed commit. Default 1200ms. */
  flashMs?: number
}

/** Lightweight wrapper around an async update function that records
 * per-id failure state. Pair with useOptimistic in the consumer for
 * instant UI feedback and automatic revert on failure. */
export function useInlineUpdate<P extends UpdatePatch>(
  update: (id: string, patch: P) => Promise<UpdateResult>,
  options: UseInlineUpdateOptions = {},
): UseInlineUpdateResult<P> {
  const flashMs = options.flashMs ?? 1200
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
    }
  }, [])

  const markFailed = useCallback(
    (id: string, message: string) => {
      setFailedIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setErrors((prev) => {
        const next = new Map(prev)
        next.set(id, message)
        return next
      })
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)
      const handle = setTimeout(() => {
        setFailedIds((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        timers.current.delete(id)
      }, flashMs)
      timers.current.set(id, handle)
    },
    [flashMs],
  )

  const commit = useCallback(
    async (id: string, patch: P): Promise<UpdateResult> => {
      const result = await update(id, patch)
      if (!result.ok) {
        markFailed(id, result.error ?? 'Update failed')
      } else if (errors.has(id)) {
        setErrors((prev) => {
          if (!prev.has(id)) return prev
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }
      return result
    },
    [update, markFailed, errors],
  )

  const isFailed = useCallback((id: string) => failedIds.has(id), [failedIds])
  const errorFor = useCallback((id: string) => errors.get(id), [errors])

  const clear = useCallback((id?: string) => {
    if (id == null) {
      setFailedIds(new Set())
      setErrors(new Map())
      for (const t of timers.current.values()) clearTimeout(t)
      timers.current.clear()
      return
    }
    setFailedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setErrors((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  return { commit, isFailed, errorFor, clear }
}
