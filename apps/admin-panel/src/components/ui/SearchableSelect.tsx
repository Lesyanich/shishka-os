import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface SearchableOption {
  value: string
  label: string
  /** Secondary line — product code, supplier category, anything disambiguating. */
  sublabel?: string | null
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  /** Accessible name; also the fallback button text when nothing is picked. */
  label: string
  placeholder?: string
  disabled?: boolean
  emptyText?: string
}

/**
 * A <select> replacement for lists a human cannot scan by eye — 80 suppliers,
 * hundreds of products. Opens a panel with a filter box instead of a native
 * dropdown.
 *
 * Deliberately dependency-free: matching is a case-insensitive substring over
 * label + sublabel, which is what "find the thing I am typing" means here. No
 * fuzzy library, no combobox package.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select…',
  disabled = false,
  emptyText = 'Nothing matches',
}: Props) {
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false),
    )
  }, [options, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  // Click outside and Escape both close — a picker that traps the user is worse
  // than the native select it replaces.
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, close])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-left text-xs text-cream outline-none transition focus:border-forest-soft disabled:opacity-50"
      >
        <span className={`truncate ${selected ? 'text-cream' : 'text-cream/40'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-cream/45" />
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] shadow-lg">
          <div className="flex items-center gap-2 border-b border-[var(--line-strong)] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-cream/45" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${label}`}
              className="h-6 w-full bg-transparent text-xs text-cream outline-none placeholder:text-cream/35"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="shrink-0 text-cream/45 transition hover:text-cream"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ul role="listbox" aria-label={label} className="max-h-56 overflow-y-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-2 text-[11px] text-cream/45">{emptyText}</li>
            )}
            {results.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    close()
                  }}
                  className={`flex w-full flex-col items-start px-3 py-1.5 text-left transition hover:bg-[var(--s-3)] ${
                    o.value === value ? 'bg-[var(--s-3)]' : ''
                  }`}
                >
                  <span className="text-xs text-cream">{o.label}</span>
                  {o.sublabel && (
                    <span className="text-[10px] text-cream/45">{o.sublabel}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {results.length < options.length && (
            <p className="border-t border-[var(--line-strong)] px-3 py-1.5 text-[10px] text-cream/45">
              {results.length} of {options.length}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
