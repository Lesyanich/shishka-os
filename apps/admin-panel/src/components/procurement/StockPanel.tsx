import { useCallback, useMemo, useOptimistic, useState } from 'react'
import { AlertTriangle, Loader2, PackageX, ShoppingCart } from 'lucide-react'
import { useStockStatus } from '../../hooks/useStockStatus'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { InlineEditCell } from '../menu/owner/InlineEditCell'
import {
  STOCK_STATUS_META,
  isParBelowMin,
  type StockParPatch,
  type StockStatusRow,
} from '../../types/stockStatus'
import type { PrefillLine } from './StockRequestsPanel'

type Filter = 'all' | 'lowout' | 'expiring'

interface Props {
  /** Hand reorder lines to the PO form (parent switches to the Orders tab). */
  onAddToPO: (lines: PrefillLine[], notes: string) => void
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof PackageX
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wide text-cream/45">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-cream">{value}</p>
    </div>
  )
}

export function fmtQty(n: number | null, unit: string | null): string {
  if (n == null) return '—'
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2)
  return unit ? `${v} ${unit}` : v
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function StockPanel({ onAddToPO }: Props) {
  const { rows, isLoading, error, updatePar, lowCount, expiringCount, untrackedCount } =
    useStockStatus()

  const inline = useInlineUpdate((id: string, patch: StockParPatch) => updatePar(id, patch))
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, p: { id: string; patch: StockParPatch }) =>
      state.map((r) => (r.nomenclature_id === p.id ? { ...r, ...p.patch } : r)),
  )

  const [filter, setFilter] = useState<Filter>('all')
  const [storage, setStorage] = useState<string>('all')
  const [search, setSearch] = useState('')

  const commitPar = useCallback(
    async (row: StockStatusRow, patch: StockParPatch) => {
      setOptimistic({ id: row.nomenclature_id, patch })
      await inline.commit(row.nomenclature_id, patch)
    },
    [inline, setOptimistic],
  )

  const storages = useMemo(() => {
    const set = new Set<string>()
    for (const r of optimistic) if (r.storage_location) set.add(r.storage_location)
    return Array.from(set).sort()
  }, [optimistic])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return optimistic.filter((r) => {
      if (filter === 'lowout' && r.stock_status !== 'low' && r.stock_status !== 'out') return false
      if (filter === 'expiring' && r.expiring_soon === 0 && r.expired === 0) return false
      if (storage !== 'all' && r.storage_location !== storage) return false
      if (q && !r.name.toLowerCase().includes(q) && !r.product_code.toLowerCase().includes(q))
        return false
      return true
    })
  }, [optimistic, filter, storage, search])

  const reorderLow = useCallback(() => {
    const lines: PrefillLine[] = optimistic
      .filter(
        (r) => (r.stock_status === 'low' || r.stock_status === 'out') && (r.suggested_qty ?? 0) > 0,
      )
      .map((r) => ({ nomenclature_id: r.nomenclature_id, qty_ordered: r.suggested_qty as number }))
    if (lines.length === 0) return
    onAddToPO(lines, 'Reorder — low stock')
  }, [optimistic, onAddToPO])

  const addRowToPO = useCallback(
    (r: StockStatusRow) => {
      const qty = r.suggested_qty && r.suggested_qty > 0 ? r.suggested_qty : 1
      onAddToPO([{ nomenclature_id: r.nomenclature_id, qty_ordered: qty }], `Reorder — ${r.name}`)
    },
    [onAddToPO],
  )

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={PackageX} label="Low / Out" value={lowCount} color="text-brick-bright" />
        <StatCard
          icon={AlertTriangle}
          label="Expiring"
          value={expiringCount}
          color="text-amber-watch"
        />
        <StatCard
          icon={ShoppingCart}
          label="Untracked"
          value={untrackedCount}
          color="text-cream/60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'lowout', label: 'Low / Out' },
            { key: 'expiring', label: 'Expiring' },
          ] as const
        ).map((f) => (
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
        {storages.length > 0 && (
          <select
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
            className="h-7 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2 text-[11px] text-cream outline-none focus:border-forest-soft"
          >
            <option value="all">All storage</option>
            {storages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto h-7 w-40 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 text-xs text-cream outline-none focus:border-forest-soft"
        />
        <button
          type="button"
          onClick={reorderLow}
          disabled={lowCount === 0}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-royal-green)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Reorder all low
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-xs text-cream/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading stock…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] py-10 text-center text-sm text-cream/45">
          Nothing here. Set min/par on stock-sheet items to start tracking.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">Par</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2 text-right">Suggested</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = STOCK_STATUS_META[r.stock_status]
                const parWarn = isParBelowMin(r)
                const drift = r.consumed_since_count > 0
                return (
                  <tr
                    key={r.nomenclature_id}
                    className={[
                      'border-b border-[var(--line)] last:border-none',
                      inline.isFailed(r.nomenclature_id) ? 'bg-brick-soft/5' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-cream">{r.name}</span>
                        {r.storage_location && (
                          <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 text-[9px] text-cream/60">
                            {r.storage_location}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-cream/30">{r.product_code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream">
                      {fmtQty(r.on_hand, r.base_unit)}
                      {drift && (
                        <span
                          className="block text-[10px] text-amber-watch/80"
                          title="Sales since last count are not yet deducted from balances — run a stocktake."
                        >
                          est. {fmtQty(r.theoretical_on_hand, r.base_unit)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <InlineEditCell<number | null>
                        value={r.min_stock}
                        variant="number"
                        min={0}
                        align="right"
                        ariaLabel={`Min stock for ${r.name}`}
                        placeholder="set…"
                        className="tabular-nums text-cream"
                        isFailed={inline.isFailed(r.nomenclature_id)}
                        onCommit={(next) => void commitPar(r, { min_stock: next })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <InlineEditCell<number | null>
                        value={r.par_stock}
                        variant="number"
                        min={0}
                        align="right"
                        ariaLabel={`Par stock for ${r.name}`}
                        placeholder="set…"
                        className={`tabular-nums ${parWarn ? 'text-amber-watch ring-1 ring-amber-watch/40 rounded' : 'text-cream'}`}
                        isFailed={inline.isFailed(r.nomenclature_id)}
                        onCommit={(next) => void commitPar(r, { par_stock: next })}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeCls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.expired > 0 ? (
                        <span className="text-brick-bright">✕ {r.expired} expired</span>
                      ) : r.expiring_soon > 0 ? (
                        <span className="text-amber-watch">
                          ⚠ {r.expiring_soon} · {fmtDate(r.next_expiry)}
                        </span>
                      ) : r.next_expiry ? (
                        <span className="text-cream/45">{fmtDate(r.next_expiry)}</span>
                      ) : (
                        <span className="text-cream/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.suggested_qty && r.suggested_qty > 0 ? (
                        <span className="font-semibold text-honey-300">
                          {fmtQty(r.suggested_qty, r.base_unit)}
                        </span>
                      ) : (
                        <span className="text-cream/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(r.stock_status === 'low' || r.stock_status === 'out') && (
                        <button
                          type="button"
                          onClick={() => addRowToPO(r)}
                          className="rounded border border-[var(--line-strong)] px-2 py-1 text-[10px] font-semibold text-cream/80 transition hover:bg-[var(--s-2)]"
                        >
                          + PO
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
