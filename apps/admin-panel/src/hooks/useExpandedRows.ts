import { useCallback, useState } from 'react'

export interface UseExpandedRowsResult {
  isExpanded: (id: string) => boolean
  toggle: (id: string) => void
  open: (id: string) => void
  close: (id: string) => void
  clear: () => void
  expandedIds: ReadonlySet<string>
}

/** Tracks a Set of row IDs currently expanded (e.g. PF drill-down).
 * Multiple rows may be expanded at once; callers decide whether to
 * enforce single-open by calling clear() before open(). */
export function useExpandedRows(initial?: Iterable<string>): UseExpandedRowsResult {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(initial ?? []),
  )

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const open = useCallback((id: string) => {
    setExpandedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const close = useCallback((id: string) => {
    setExpandedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setExpandedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const isExpanded = useCallback(
    (id: string) => expandedIds.has(id),
    [expandedIds],
  )

  return { isExpanded, toggle, open, close, clear, expandedIds }
}
