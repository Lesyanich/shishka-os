import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { usePriceBook } from '../../hooks/usePriceBook'
import type { PriceSummaryRow } from '../../types/priceBook'
import { PriceBookTable } from './PriceBookTable'
import { QuoteEntryModal } from './QuoteEntryModal'

type GroupFilter = 'all' | 'multi' | 'packaging' | 'gap'

const FILTERS: ReadonlyArray<{ key: GroupFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'multi', label: 'Multi-supplier' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'gap', label: 'Needs price' },
]

export function PriceBook() {
  const { items, supplierNames, isLoading, error, fetchComparison, recordQuote, setCanonicalCost } =
    usePriceBook()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<GroupFilter>('all')
  const [quoteItem, setQuoteItem] = useState<PriceSummaryRow | null>(null)

  const search = searchParams.get('q') ?? ''
  const setSearch = (q: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (q) p.set('q', q)
        else p.delete('q')
        return p
      },
      { replace: true },
    )
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (filter === 'multi' && it.supplier_count < 2) return false
      if (filter === 'packaging' && it.item_group !== 'packaging') return false
      if (filter === 'gap' && it.supplier_count > 0) return false
      if (q && !it.item_name.toLowerCase().includes(q) && !it.product_code.toLowerCase().includes(q))
        return false
      return true
    })
  }, [items, filter, search])

  const multiCount = useMemo(() => items.filter((it) => it.supplier_count >= 2).length, [items])

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Price Book</h2>
          <p className="text-xs text-slate-500">
            Compare supplier prices per item · {multiCount} have 2+ suppliers · record a quote so it&apos;s never lost.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                filter === f.key ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/60 text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items (e.g. cup)…"
          className="ml-auto h-8 w-52 rounded-md border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-100 outline-none focus:border-emerald-500"
        />
      </div>

      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading price book…
          </div>
        ) : (
          <PriceBookTable
            items={filtered}
            fetchComparison={fetchComparison}
            setCanonicalCost={setCanonicalCost}
            onAddQuote={setQuoteItem}
          />
        )}
      </div>

      {quoteItem && (
        <QuoteEntryModal
          item={quoteItem}
          supplierNames={supplierNames}
          onClose={() => setQuoteItem(null)}
          onSubmit={recordQuote}
        />
      )}
    </section>
  )
}
