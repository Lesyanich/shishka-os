import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Star } from 'lucide-react'
import type { PriceSummaryRow, PriceQuoteRow, SourceFamily, RpcResult } from '../../types/priceBook'

const SOURCE_BADGE: Record<SourceFamily, { label: string; cls: string }> = {
  quote: { label: 'Quote', cls: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/40' },
  receipt: { label: 'Receipt', cls: 'bg-sky-500/20 text-sky-200 ring-sky-500/40' },
  scrape: { label: 'Catalog', cls: 'bg-violet-500/20 text-violet-200 ring-violet-500/40' },
  manual: { label: 'Manual', cls: 'bg-slate-600/40 text-slate-300 ring-slate-500/40' },
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
      <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading suppliers…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-[11px] text-slate-500">
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
            <tr key={r.catalog_id} className="border-t border-slate-800/60">
              <td className="py-2 pl-10 pr-3">
                <div className="flex items-center gap-2">
                  {isBest && <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />}
                  <span className="font-medium text-slate-200">{r.supplier_name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                {(r.original_name || r.product_name) && (
                  <span className="text-[10px] text-slate-600">{r.original_name || r.product_name}</span>
                )}
              </td>
              <td className="py-2 pr-3 text-slate-500">{fmtDate(r.verified_at || r.updated_at)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${isBest ? 'text-emerald-300' : 'text-slate-200'}`}>
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
                  className="inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50"
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
    return <div className="py-8 text-center text-xs text-slate-500">No items match.</div>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] uppercase tracking-wide text-slate-500">
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
                <tr className="border-b border-slate-800/60 hover:bg-slate-900/40">
                  <td className="py-2.5 pl-3 pr-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : it.nomenclature_id)}
                      className="flex items-center gap-2 text-left"
                    >
                      {it.supplier_count > 0 ? (
                        expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                        )
                      ) : (
                        <span className="inline-block w-3.5" />
                      )}
                      <span className="font-medium text-slate-100">{it.item_name}</span>
                      {it.item_group === 'packaging' && (
                        <span className="rounded bg-slate-700/50 px-1 text-[9px] uppercase text-slate-400">pkg</span>
                      )}
                    </button>
                    <span className="ml-5 block text-[10px] text-slate-600">{it.product_code}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-center tabular-nums text-slate-300">
                    {it.supplier_count}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-300">
                    {fmtMoney(it.best_price, it.base_unit)}
                    {it.best_supplier && (
                      <span className="block text-[10px] text-slate-500">{it.best_supplier}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-300">
                    {fmtMoney(it.current_cost, it.base_unit)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {it.spread_pct != null ? (
                      <span className={it.spread_pct >= 15 ? 'text-amber-300' : 'text-slate-400'}>
                        {it.spread_pct}%
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAddQuote(it)}
                      className="inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <Plus className="mr-0.5 h-3 w-3" /> Quote
                    </button>
                  </td>
                </tr>
                {expanded && it.supplier_count > 0 && (
                  <tr>
                    <td colSpan={6} className="bg-slate-950/40 p-0">
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
