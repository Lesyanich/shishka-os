import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Star } from 'lucide-react'
import type { PriceSummaryRow, PriceQuoteRow, SourceFamily, RpcResult } from '../../types/priceBook'

const SOURCE_BADGE: Record<SourceFamily, { label: string; cls: string }> = {
  quote: { label: 'Quote', cls: 'bg-forest-soft/20 text-mint-200 ring-forest-soft/40' },
  receipt: { label: 'Receipt', cls: 'bg-honey-300/20 text-honey-300 ring-honey-300/40' },
  scrape: { label: 'Catalog', cls: 'bg-nutri-car/25 text-cream/90 ring-nutri-car/50' },
  manual: { label: 'Manual', cls: 'bg-[var(--s-3)] text-cream/80 ring-[var(--line-strong)]' },
}

function fmtMoney(n: number | null, unit?: string | null): string {
  if (n == null) return '—'
  const s = `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  return unit ? `${s}/${unit}` : s
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function SupplierRows({
  nomenclatureId,
  baseUnit,
  fetchComparison,
  setCanonicalCost,
}: {
  nomenclatureId: string
  baseUnit: string | null
  fetchComparison: (id: string) => Promise<PriceQuoteRow[]>
  setCanonicalCost: (catalogId: string) => Promise<RpcResult>
}) {
  const [rows, setRows] = useState<PriceQuoteRow[] | null>(null)
  const [promoting, setPromoting] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchComparison(nomenclatureId).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [fetchComparison, nomenclatureId])

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-cream/45">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading suppliers…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-[11px] text-cream/45">
        No supplier prices yet — add the first quote.
      </div>
    )
  }

  const best = rows.reduce<number | null>(
    (m, r) => (r.unit_cost != null && (m == null || r.unit_cost < m) ? r.unit_cost : m),
    null,
  )

  return (
    <table className="w-full border-collapse text-left text-[11px]">
      <tbody>
        {rows.map((r) => {
          const isBest = best != null && r.unit_cost === best
          const badge = SOURCE_BADGE[r.source_family]
          return (
            <tr key={r.catalog_id} className="border-t border-[var(--line)]">
              <td className="py-2 pl-10 pr-3">
                <div className="flex items-center gap-2">
                  {isBest && <Star className="h-3 w-3 fill-mint-200 text-mint-200" />}
                  <span className="font-medium text-cream">{r.supplier_name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {(r.original_name || r.product_name) && (
                  <span className="text-[10px] text-cream/30">
                    {r.original_name || r.product_name}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-cream/45">{fmtDate(r.verified_at || r.updated_at)}</td>
              <td
                className={`py-2 pr-3 text-right tabular-nums ${isBest ? 'text-mint-200' : 'text-cream'}`}
              >
                {fmtMoney(r.unit_cost, baseUnit)}
              </td>
              <td className="py-2 pr-4 text-right">
                <button
                  type="button"
                  onClick={async () => {
                    setPromoting(r.catalog_id)
                    await setCanonicalCost(r.catalog_id)
                    setPromoting(null)
                  }}
                  disabled={promoting === r.catalog_id}
                  className="inline-flex items-center rounded-md border border-[var(--line-strong)] px-2 py-1 text-[10px] text-cream/80 hover:border-forest-soft/50 hover:text-mint-200 disabled:opacity-50"
                  title="Make this the official cost for the item"
                >
                  {promoting === r.catalog_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Set as cost'
                  )}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function PriceBookTable({
  items,
  fetchComparison,
  setCanonicalCost,
  onAddQuote,
}: {
  items: PriceSummaryRow[]
  fetchComparison: (id: string) => Promise<PriceQuoteRow[]>
  setCanonicalCost: (catalogId: string) => Promise<RpcResult>
  onAddQuote: (item: PriceSummaryRow) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (items.length === 0) {
    return <div className="py-8 text-center text-xs text-cream/45">No items match.</div>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--line)]">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
            <th className="py-2 pl-3 pr-3">Item</th>
            <th className="py-2 pr-3 text-center">Suppliers</th>
            <th className="py-2 pr-3 text-right">Best</th>
            <th className="py-2 pr-3 text-right">Current cost</th>
            <th className="py-2 pr-3 text-right">Spread</th>
            <th className="py-2 pr-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const expanded = expandedId === it.nomenclature_id
            return (
              <Fragment key={it.nomenclature_id}>
                <tr className="border-b border-[var(--line)] hover:bg-[var(--s-1)]">
                  <td className="py-2.5 pl-3 pr-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : it.nomenclature_id)}
                      className="flex items-center gap-2 text-left"
                    >
                      {it.supplier_count > 0 ? (
                        expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-cream/45" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-cream/45" />
                        )
                      ) : (
                        <span className="inline-block w-3.5" />
                      )}
                      <span className="font-medium text-cream">{it.item_name}</span>
                      {it.item_group === 'packaging' && (
                        <span className="rounded bg-[var(--s-3)] px-1 text-[9px] uppercase text-cream/60">
                          pkg
                        </span>
                      )}
                    </button>
                    <span className="ml-5 block text-[10px] text-cream/30">{it.product_code}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-center tabular-nums text-cream/80">
                    {it.supplier_count}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-mint-200">
                    {fmtMoney(it.best_price, it.base_unit)}
                    {it.best_supplier && (
                      <span className="block text-[10px] text-cream/45">{it.best_supplier}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-cream/80">
                    {fmtMoney(it.current_cost, it.base_unit)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {it.spread_pct != null ? (
                      <span className={it.spread_pct >= 15 ? 'text-amber-watch' : 'text-cream/60'}>
                        {it.spread_pct}%
                      </span>
                    ) : (
                      <span className="text-cream/30">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAddQuote(it)}
                      className="inline-flex items-center rounded-md border border-[var(--line-strong)] px-2 py-1 text-[10px] text-cream/80 hover:border-forest-soft/50 hover:text-mint-200"
                    >
                      <Plus className="mr-0.5 h-3 w-3" /> Quote
                    </button>
                  </td>
                </tr>
                {expanded && it.supplier_count > 0 && (
                  <tr>
                    <td colSpan={6} className="bg-black/70 p-0">
                      <SupplierRows
                        nomenclatureId={it.nomenclature_id}
                        baseUnit={it.base_unit}
                        fetchComparison={fetchComparison}
                        setCanonicalCost={setCanonicalCost}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
