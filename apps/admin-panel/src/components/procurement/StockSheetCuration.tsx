import { useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { useStockSheetCuration } from '../../hooks/useStockSheetCuration'
import { STORAGE_OPTIONS, STORAGE_LABELS } from '../../types/stockSheet'

export function StockSheetCuration() {
  const { items, isLoading, error, setInclude, setStorage } = useStockSheetCuration()
  const [search, setSearch] = useState('')
  const [onlyIncluded, setOnlyIncluded] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (onlyIncluded && !it.in_stock_sheet) return false
      if (!q) return true
      return (
        it.name.toLowerCase().includes(q) ||
        it.product_code.toLowerCase().includes(q) ||
        (it.category_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, search, onlyIncluded])

  const includedCount = items.filter((it) => it.in_stock_sheet).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-cream">Sheet Items</h3>
          <p className="text-xs text-cream/45">
            Pick which items staff see on /stock and set their storage zone.
          </p>
        </div>
        <span className="rounded-lg bg-[var(--s-2)] px-2.5 py-1 text-xs font-semibold text-mint-200">
          {includedCount} on sheet
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/45" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] pl-8 pr-3 text-xs text-cream outline-none focus:border-forest-soft"
          />
        </div>
        <button
          onClick={() => setOnlyIncluded((v) => !v)}
          className={`rounded-md border px-3 text-xs font-medium transition ${
            onlyIncluded
              ? 'border-forest-soft/50 bg-forest-soft/10 text-mint-200'
              : 'border-[var(--line-strong)] text-cream/60 hover:bg-[var(--s-2)]'
          }`}
        >
          On sheet
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12 text-cream/45">
          <Loader2 className="h-5 w-5 animate-spin text-mint-200" />
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((it) => (
            <div
              key={it.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                it.in_stock_sheet
                  ? 'border-forest-soft/30 bg-forest-soft/5'
                  : 'border-[var(--line)] bg-[var(--s-1)]'
              }`}
            >
              <button
                onClick={() => setInclude(it.id, !it.in_stock_sheet)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition ${
                  it.in_stock_sheet
                    ? 'bg-[var(--color-royal-soft)] text-white'
                    : 'border border-[var(--line-strong)] text-transparent hover:border-forest-soft'
                }`}
                aria-label={it.in_stock_sheet ? 'Remove from sheet' : 'Add to sheet'}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-cream">{it.name}</p>
                <p className="truncate text-[10px] text-cream/45">{it.category_name ?? '—'}</p>
              </div>
              <select
                value={it.storage_location ?? ''}
                onChange={(e) => setStorage(it.id, e.target.value || null)}
                className="h-7 shrink-0 rounded border border-[var(--line-strong)] bg-[var(--s-2)] px-1.5 text-[11px] text-cream outline-none focus:border-forest-soft"
              >
                <option value="">— zone —</option>
                {STORAGE_OPTIONS.map((z) => (
                  <option key={z} value={z}>
                    {STORAGE_LABELS[z].en}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-cream/45">No matches.</p>
          )}
        </div>
      )}
    </div>
  )
}
