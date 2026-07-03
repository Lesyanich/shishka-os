import { useMemo, useState } from 'react'
import { CalendarClock, ClipboardList, Loader2, Package } from 'lucide-react'
import { useStationChecklist } from '../../hooks/useStationChecklist'
import { COUNT_CLASS_META, type Station } from '../../types/stations'
import { fmtQty } from './StockPanel'

type KindFilter = 'food' | 'packaging'

/** Read-only per-station checklist (S1): what this station counts, derived
 * live from station_categories -> BOM (v_station_checklist). S2 adds the
 * mobile count flow on top of the same view. */
export function StationChecklistPanel({ station }: { station: Station }) {
  const { rows, isLoading, error, dueCount, foodCount, packagingCount } =
    useStationChecklist(station.id)

  const [kind, setKind] = useState<KindFilter>('food')
  const [dueOnly, setDueOnly] = useState(false)
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (r.item_kind !== kind) return false
      if (dueOnly && !r.is_due_today) return false
      if (q && !r.name.toLowerCase().includes(q) && !r.product_code.toLowerCase().includes(q))
        return false
      return true
    })
  }, [rows, kind, dueOnly, search])

  const fmtAge = (iso: string | null): string => {
    if (!iso) return 'never'
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (days <= 0) return 'today'
    if (days === 1) return '1 d ago'
    return `${days} d ago`
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-cream/60" />
            <span className="text-[10px] uppercase tracking-wide text-cream/45">Checklist</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-cream">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-watch" />
            <span className="text-[10px] uppercase tracking-wide text-cream/45">Due today</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-cream">{dueCount}</p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-cream/60" />
            <span className="text-[10px] uppercase tracking-wide text-cream/45">
              Food / Packaging
            </span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-cream">
            {foodCount} / {packagingCount}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'food' as const, label: `Food (${foodCount})` },
            { key: 'packaging' as const, label: `Packaging (${packagingCount})` },
          ]
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={[
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
              kind === f.key
                ? 'bg-[var(--s-3)] text-cream'
                : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDueOnly((v) => !v)}
          className={[
            'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
            dueOnly
              ? 'bg-amber-watch/20 text-amber-watch'
              : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
          ].join(' ')}
        >
          Due today only
        </button>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="ml-auto h-7 w-40 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 text-xs text-cream outline-none focus:border-forest-soft"
        />
      </div>

      {error && (
        <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-xs text-cream/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deriving checklist…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] py-10 text-center text-sm text-cream/45">
          Nothing here — this station has no {kind} items mapped. Add menu sections
          to the station or list staples as extra items.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Last count</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">Par</th>
                <th className="px-3 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const cls = r.count_class ? COUNT_CLASS_META[r.count_class] : null
                return (
                  <tr key={r.nomenclature_id} className="border-b border-[var(--line)] last:border-none">
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-cream">{r.name}</span>
                      <span className="block text-[10px] text-cream/30">{r.product_code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {cls ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls.badgeCls}`}
                        >
                          {cls.label}
                        </span>
                      ) : (
                        <span className="text-cream/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream">
                      {fmtQty(r.batch_on_hand, r.base_unit)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream/70">
                      {r.last_count != null ? fmtQty(r.last_count, r.base_unit) : '—'}
                      <span className="block text-[10px] text-cream/35">{fmtAge(r.last_count_at)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream/70">
                      {r.min_stock ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream/70">
                      {r.par_stock ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.is_due_today ? (
                        <span className="rounded bg-amber-watch/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-watch">
                          due
                        </span>
                      ) : (
                        <span className="text-cream/30">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
