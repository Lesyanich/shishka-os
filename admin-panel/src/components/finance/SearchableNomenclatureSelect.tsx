import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { nomenclatureOptionText } from './NomenclatureLabel'

export interface NomenclatureOption {
  id: string
  name: string
  product_code: string
}

interface Props {
  value: string | null | undefined
  options: NomenclatureOption[]
  itemName: string | null | undefined
  onChange: (value: string) => void
  isMapped: boolean
}

export function SearchableNomenclatureSelect({
  value,
  options,
  itemName,
  onChange,
  isMapped,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build display text for current selection
  const displayText = useMemo(() => {
    if (!value || value === '' || value === '__NEW__') return ''
    const found = options.find((o) => o.id === value)
    return found ? nomenclatureOptionText(found.product_code, found.name) : ''
  }, [value, options])

  // Filtered options
  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase().trim()
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.product_code.toLowerCase().includes(q),
    )
  }, [options, search])

  // Build full list: special options + filtered
  const specialOptions = useMemo(() => {
    const items: { id: string; label: string }[] = []
    items.push({ id: '', label: 'Map to item...' })
    if (itemName) {
      items.push({ id: '__CREATE__', label: `+ Create: "${itemName}"` })
    }
    return items
  }, [itemName])

  const totalCount = specialOptions.length + filtered.length

  // Click-outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, isOpen])

  const selectItem = useCallback(
    (id: string) => {
      onChange(id)
      setIsOpen(false)
      setSearch('')
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault()
          setIsOpen(true)
          setHighlightIdx(0)
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIdx((prev) => Math.min(prev + 1, totalCount - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIdx((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightIdx < specialOptions.length) {
            selectItem(specialOptions[highlightIdx].id)
          } else {
            const opt = filtered[highlightIdx - specialOptions.length]
            if (opt) selectItem(opt.id)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setSearch('')
          break
      }
    },
    [isOpen, highlightIdx, totalCount, specialOptions, filtered, selectItem],
  )

  const borderCls = isMapped
    ? 'border-emerald-500/30 focus-within:border-emerald-400/60'
    : 'border-amber-500/40 ring-1 ring-amber-500/10 focus-within:border-amber-400/60'

  return (
    <div ref={wrapperRef} className="relative flex-1">
      {/* ── Input ── */}
      <div
        className={`flex items-center gap-1 rounded-lg border bg-slate-800/60 px-2 py-1 text-[10px] transition-colors ${borderCls}`}
      >
        <Search className="h-3 w-3 shrink-0 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : displayText}
          placeholder={isMapped ? displayText || 'Map to item...' : 'Map to item...'}
          onChange={(e) => {
            setSearch(e.target.value)
            setHighlightIdx(0)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
            setSearch('')
            setHighlightIdx(0)
          }}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-200 outline-none placeholder:text-slate-500"
        />
        <ChevronDown
          className={`h-3 w-3 shrink-0 cursor-pointer text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false)
              setSearch('')
            } else {
              setIsOpen(true)
              inputRef.current?.focus()
            }
          }}
        />
      </div>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-48 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-850 shadow-xl shadow-black/40 backdrop-blur-sm"
          style={{ backgroundColor: 'rgb(20 25 40 / 0.97)' }}
        >
          {/* Special options */}
          {specialOptions.map((so, idx) => (
            <div
              key={so.id || '__empty__'}
              data-idx={idx}
              onMouseEnter={() => setHighlightIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault()
                selectItem(so.id)
              }}
              className={`cursor-pointer px-2.5 py-1.5 text-[10px] transition-colors ${
                idx === highlightIdx
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : so.id === '__CREATE__'
                    ? 'text-teal-400 hover:bg-teal-500/10'
                    : 'text-slate-400 hover:bg-slate-700/40'
              }`}
            >
              {so.id === '' && '✓ '}
              {so.label}
            </div>
          ))}

          {/* Divider */}
          {filtered.length > 0 && (
            <div className="mx-2 border-t border-slate-700/40" />
          )}

          {/* Nomenclature options */}
          {filtered.map((opt, i) => {
            const idx = specialOptions.length + i
            const isSelected = opt.id === value
            return (
              <div
                key={opt.id}
                data-idx={idx}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(opt.id)
                }}
                className={`cursor-pointer px-2.5 py-1.5 text-[10px] transition-colors ${
                  idx === highlightIdx
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : isSelected
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-700/40'
                }`}
              >
                {nomenclatureOptionText(opt.product_code, opt.name)}
              </div>
            )
          })}

          {/* Empty state */}
          {filtered.length === 0 && search.trim() && (
            <div className="px-2.5 py-3 text-center text-[10px] text-slate-500">
              No items matching "{search}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}
