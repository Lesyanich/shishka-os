import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface FilterChipOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface FilterChipProps<T extends string> {
  label: string
  options: FilterChipOption<T>[]
  selectedValues: T[]
  onChange: (next: T[]) => void
  /** 'multi' (default) checkboxes; 'single' radio behavior */
  mode?: 'multi' | 'single'
}

export function FilterChip<T extends string>({
  label,
  options,
  selectedValues,
  onChange,
  mode = 'multi',
}: FilterChipProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeCount = selectedValues.length

  // TODO(a11y-v2): Esc-to-close + focus trap + arrow-key navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (v: T) => {
    if (mode === 'single') {
      onChange(selectedValues.includes(v) ? [] : [v])
    } else {
      onChange(
        selectedValues.includes(v)
          ? selectedValues.filter((s) => s !== v)
          : [...selectedValues, v],
      )
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          activeCount > 0
            ? 'border-forest-soft/40 bg-royal-green/25 text-forest-soft'
            : 'border-surface-3 bg-surface-1 text-cream/70 hover:text-cream'
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="rounded-full bg-forest-soft/30 px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-surface-3 bg-surface-2 p-2 shadow-lg">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((opt) => {
              const checked = selectedValues.includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-cream/80 hover:bg-surface-3"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={mode === 'single' ? 'radio' : 'checkbox'}
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="h-3.5 w-3.5 accent-forest-soft"
                    />
                    {opt.label}
                  </span>
                  {opt.count != null && (
                    <span className="font-mono text-[10px] tabular-nums opacity-50">
                      {opt.count}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[11px] text-cream/50 hover:bg-surface-3 hover:text-cream"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
