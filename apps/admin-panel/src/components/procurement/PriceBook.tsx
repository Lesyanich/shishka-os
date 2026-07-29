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
  const {
    items, supplierNames, unlinkedCount, isLoading, error,
    fetchComparison, recordQuote, setCanonicalCost,
  } = usePriceBook()
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
      if (
        q &&
        !it.item_name.toLowerCase().includes(q) &&
        !it.product_code.toLowerCase().includes(q)
      )
        return false
      return true
    })
  }, [items, filter, search])

  const multiCount = useMemo(() => items.filter((it) => it.supplier_count >= 2).length, [items])

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-cream">Price Book</h2>
          <p className="text-xs text-cream/45">
            Compare supplier prices per item · {multiCount} have 2+ suppliers · record a quote so
            it&apos;s never lost.
          </p>
        </div>
      </header>

      {/* What this table does NOT contain. A price for a product we have not
          linked to an item cannot be compared or ordered
          (po_lines.nomenclature_id is NOT NULL), so it renders nowhere — and
          without saying so, the table reads as the complete picture. */}
      {unlinkedCount > 0 && (
        <p className="border-b border-[var(--line)] bg-[var(--s-2)] px-4 py-2 text-[11px] text-amber-300/80">
          {unlinkedCount} supplier price{unlinkedCount === 1 ? '' : 's'} are not shown here — they
          belong to products not yet linked to an item, so they cannot be compared or ordered yet.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                filter === f.key
                  ? 'bg-[var(--s-3)] text-cream'
                  : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
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
          className="ml-auto h-8 w-52 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 text-xs text-cream outline-none focus:border-forest-soft"
        />
      </div>

      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-cream/45">
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
