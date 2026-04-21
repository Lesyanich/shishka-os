import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'

export interface UseRowKeyboardNavOptions {
  ids: string[]
  /** Enter on focused row (e.g. toggle expand). */
  onEnter?: (id: string) => void
  /** 'o' — open detail drawer / secondary surface. */
  onOpen?: (id: string) => void
  /** 'e' — enter edit mode on the focused row's primary editable cell. */
  onEdit?: (id: string) => void
  /** Escape when nothing else is open. Called with previously-focused id
   * (or null). Use to clear focus or close an overlay. */
  onEscape?: (id: string | null) => void
  /** Start with this id focused. */
  initialFocusedId?: string | null
  /** When true, the container auto-focuses on mount. Default false. */
  autoFocus?: boolean
}

export interface RowKbdContainerProps {
  ref: RefObject<HTMLDivElement | null>
  tabIndex: 0
  role: 'grid'
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  'aria-activedescendant': string | undefined
}

export interface UseRowKeyboardNavResult {
  focusedId: string | null
  focusedIndex: number
  setFocused: (id: string | null) => void
  focusFirst: () => void
  focusNext: () => void
  focusPrev: () => void
  containerProps: RowKbdContainerProps
}

/** Shared keyboard handler for any list/grid that navigates by row id.
 * Bindings: j/ArrowDown, k/ArrowUp, Enter, 'o', 'e', Escape.
 * Ignores events whose target is an editable control (input, textarea,
 * select, contenteditable) so inline-edit inputs keep their native
 * semantics. */
export function useRowKeyboardNav({
  ids,
  onEnter,
  onOpen,
  onEdit,
  onEscape,
  initialFocusedId = null,
  autoFocus = false,
}: UseRowKeyboardNavOptions): UseRowKeyboardNavResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(initialFocusedId)

  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    ids.forEach((id, i) => map.set(id, i))
    return map
  }, [ids])

  const focusedIndex = focusedId != null ? indexById.get(focusedId) ?? -1 : -1

  // If the currently focused row disappeared from the list (filter change),
  // snap focus to the nearest valid id (by old index) rather than stranding.
  useEffect(() => {
    if (focusedId == null) return
    if (indexById.has(focusedId)) return
    if (ids.length === 0) {
      setFocusedId(null)
      return
    }
    setFocusedId(ids[0])
  }, [focusedId, ids, indexById])

  const focusFirst = useCallback(() => {
    if (ids.length > 0) setFocusedId(ids[0])
  }, [ids])

  const focusNext = useCallback(() => {
    if (ids.length === 0) return
    setFocusedId((prev) => {
      if (prev == null) return ids[0]
      const idx = indexById.get(prev)
      if (idx == null) return ids[0]
      return ids[Math.min(idx + 1, ids.length - 1)]
    })
  }, [ids, indexById])

  const focusPrev = useCallback(() => {
    if (ids.length === 0) return
    setFocusedId((prev) => {
      if (prev == null) return ids[0]
      const idx = indexById.get(prev)
      if (idx == null) return ids[0]
      return ids[Math.max(idx - 1, 0)]
    })
  }, [ids, indexById])

  const isEditable = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.isContentEditable) return true
    return false
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Escape is always handled (even inside inputs — e.g. cancel edit
      // delegates to the input's own onKeyDown which stops propagation).
      if (e.key === 'Escape') {
        if (focusedId != null || onEscape) {
          onEscape?.(focusedId)
          if (focusedId != null) setFocusedId(null)
        }
        return
      }
      // All other bindings defer to native form controls.
      if (isEditable(e.target)) return

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          focusNext()
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          focusPrev()
          break
        case 'Enter':
          if (focusedId != null && onEnter) {
            e.preventDefault()
            onEnter(focusedId)
          }
          break
        case 'o':
        case 'O':
          if (focusedId != null && onOpen) {
            e.preventDefault()
            onOpen(focusedId)
          }
          break
        case 'e':
        case 'E':
          if (focusedId != null && onEdit) {
            e.preventDefault()
            onEdit(focusedId)
          }
          break
        default:
          break
      }
    },
    [focusedId, focusNext, focusPrev, isEditable, onEnter, onOpen, onEdit, onEscape],
  )

  useEffect(() => {
    if (autoFocus) containerRef.current?.focus()
  }, [autoFocus])

  const containerProps: RowKbdContainerProps = useMemo(
    () => ({
      ref: containerRef,
      tabIndex: 0,
      role: 'grid',
      onKeyDown,
      'aria-activedescendant': focusedId ? `row-${focusedId}` : undefined,
    }),
    [onKeyDown, focusedId],
  )

  return {
    focusedId,
    focusedIndex,
    setFocused: setFocusedId,
    focusFirst,
    focusNext,
    focusPrev,
    containerProps,
  }
}
