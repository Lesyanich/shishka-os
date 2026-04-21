import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export type InlineVariant = 'text' | 'number' | 'textarea'

interface InlineEditCellProps<T extends string | number | null> {
  value: T
  onCommit: (next: T) => void | Promise<void>
  variant?: InlineVariant
  /** Optional formatter for the static display. If not provided, the raw
   * value is stringified. null/empty string shows a dimmed placeholder. */
  format?: (v: T) => ReactNode
  /** Static placeholder copy when value is null/empty. */
  placeholder?: string
  /** When false, cell renders as visibly inert (no hover affordance). */
  editable?: boolean
  /** Parent signals a recent failure → brick flash on the cell. */
  isFailed?: boolean
  /** Tailwind class passthrough for the display span. */
  className?: string
  /** For number variant. */
  min?: number
  max?: number
  step?: number
  /** Align the editor to the right (numbers). */
  align?: 'left' | 'right'
  /** Rows for textarea. Default 3. */
  rows?: number
  /** ARIA label for the input (screen reader support). */
  ariaLabel?: string
}

/** Brick-red focus/failure styles are driven by the design tokens added in
 * the foundation commit. The 120 ms fade-in + 3 px shadow is spec'd in the
 * task description; failure flash is a short 2 px ring pulse. */
export function InlineEditCell<T extends string | number | null>({
  value,
  onCommit,
  variant = 'text',
  format,
  placeholder = '—',
  editable = true,
  isFailed = false,
  className,
  min,
  max,
  step,
  align,
  rows = 3,
  ariaLabel,
}: InlineEditCellProps<T>) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      if ('select' in (inputRef.current ?? {})) {
        ;(inputRef.current as HTMLInputElement)?.select?.()
      }
    }
  }, [isEditing])

  const start = useCallback(() => {
    if (!editable) return
    setDraft(value == null ? '' : String(value))
    setIsEditing(true)
  }, [editable, value])

  const cancel = useCallback(() => setIsEditing(false), [])

  const parse = useCallback(
    (raw: string): T => {
      if (variant === 'number') {
        const trimmed = raw.trim()
        if (trimmed === '') return null as T
        const n = Number(trimmed)
        return (Number.isFinite(n) ? n : null) as T
      }
      return (raw === '' ? null : raw) as T
    },
    [variant],
  )

  const commit = useCallback(async () => {
    const next = parse(draft)
    setIsEditing(false)
    // Skip round-trip when the value is unchanged
    if (next === value || (next == null && (value == null || value === ''))) return
    await onCommit(next)
  }, [draft, parse, value, onCommit])

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      } else if (e.key === 'Enter' && (variant !== 'textarea' || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void commit()
      }
    },
    [cancel, commit, variant],
  )

  const alignCls = align === 'right' ? 'text-right' : 'text-left'
  const brickRing =
    'border border-[var(--color-brick-soft)]/60 shadow-[0_0_0_3px_rgba(155,28,33,0.18)] transition-[box-shadow,border-color] duration-[120ms] ease-out'
  const failFlash =
    'ring-2 ring-inset ring-[var(--color-royal-red)]/70 animate-[inline-flash_800ms_ease-out]'

  if (isEditing) {
    const common = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: () => void commit(),
      onKeyDown: onKey,
      'aria-label': ariaLabel,
      className: `w-full rounded bg-[var(--color-surface-1)] px-2 py-1 text-xs text-[color:var(--color-cream)] focus:outline-none ${alignCls} ${brickRing}`,
    } as const
    if (variant === 'textarea') {
      return <textarea {...common} rows={rows} />
    }
    return (
      <input
        {...common}
        type={variant === 'number' ? 'number' : 'text'}
        min={min}
        max={max}
        step={step}
        inputMode={variant === 'number' ? 'decimal' : undefined}
      />
    )
  }

  const displayed = value == null || value === '' ? null : format ? format(value) : String(value)
  const hover = editable
    ? 'cursor-text rounded px-1 -mx-1 transition hover:bg-[var(--color-surface-3)]/60'
    : 'cursor-default opacity-80'
  const flashCls = isFailed ? failFlash : ''

  return (
    <button
      type="button"
      onClick={start}
      disabled={!editable}
      aria-label={ariaLabel}
      className={`inline-block ${alignCls} ${hover} ${flashCls} ${className ?? ''}`}
    >
      {displayed ?? <span className="text-slate-600">{placeholder}</span>}
    </button>
  )
}
