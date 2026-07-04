import { useCallback, useMemo, useState } from 'react'
import { CalendarClock, ClipboardList, Loader2, Package, Play } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStationChecklist } from '../../hooks/useStationChecklist'
import { useStocktakeSession } from '../../hooks/useStocktakeSession'
import { useAppRole } from '../../contexts/AppRoleContext'
import { InlineEditCell } from '../menu/owner/InlineEditCell'
import { COUNT_CLASS_META, type ChecklistItemKind, type Station } from '../../types/stations'
import { fmtQty } from './StockPanel'
import { CountZoneBar } from './CountZoneBar'

/** Per-station checklist derived from station_categories -> BOM
 * (v_station_checklist). Read-only until you "Start count", which opens an
 * editable stocktake document: type actual quantities (In/Low/Out zone bar),
 * then Apply to record the counts and post the variance. Min/Par are editable
 * inline at any time (per-station overrides in station_par). */
export function StationChecklistPanel({ station }: { station: Station }) {
  const { rows, isLoading, error, refetch, dueCount, foodCount, packagingCount } =
    useStationChecklist(station.id)
  const { staffName } = useAppRole()

  const [kind, setKind] = useState<ChecklistItemKind>('food')
  const [dueOnly, setDueOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [baseline, setBaseline] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const session = useStocktakeSession(station.code, station.id, kind, staffName ?? 'admin')

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

  const savePar = useCallback(
    async (nomenclatureId: string, patch: { min_stock?: number | null; par_stock?: number | null }) => {
      await supabase
        .from('station_par')
        .upsert(
          { nomenclature_id: nomenclatureId, location_id: station.location_id, ...patch },
          { onConflict: 'nomenclature_id,location_id' },
        )
      await refetch()
    },
    [station.location_id, refetch],
  )

  const handleApply = useCallback(async () => {
    const res = await session.apply()
    if (res.ok) {
      const v = Math.round(res.variance ?? 0)
      setBanner(`Count applied — variance ${v > 0 ? '+' : ''}${v.toLocaleString()} ฿`)
      await refetch()
    }
  }, [session, refetch])

  const counting = session.session != null
  const fmtAge = (iso: string | null): string => {
    if (!iso) return 'never'
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    return days <= 0 ? 'today' : days === 1 ? '1 d ago' : `${days} d ago`
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
            <span className="text-[10px] uppercase tracking-wide text-cream/45">Food / Pack</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-cream">
            {foodCount} / {packagingCount}
          </p>
        </div>
      </div>

      {/* Count controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--s-1)] px-3 py-2">
        {counting ? (
          <>
            <span className="text-xs font-medium text-cream">
              Counting {station.name} · {session.session?.doc_number}
              {session.session?.is_baseline && (
                <span className="ml-1.5 rounded bg-[var(--s-2)] px-1 py-0.5 text-[9px] text-cream/50">
                  baseline
                </span>
              )}
            </span>
            <span className="text-[11px] text-cream/45">
              {Object.keys(session.counts).length} counted
            </span>
            <button
              type="button"
              onClick={handleApply}
              disabled={session.busy || Object.keys(session.counts).length === 0}
              className="ml-auto rounded-md bg-[var(--color-royal-green)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
            >
              Apply count
            </button>
            <button
              type="button"
              onClick={session.cancel}
              disabled={session.busy}
              className="rounded-md border border-[var(--line-strong)] px-2.5 py-1.5 text-[11px] font-medium text-cream/70 transition hover:bg-[var(--s-2)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-cream/60">
              Count {station.name} ({kind}) — enter actual quantities, then apply.
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-cream/60">
              <input
                type="checkbox"
                checked={baseline}
                onChange={(e) => setBaseline(e.target.checked)}
                className="accent-[var(--color-royal-green)]"
              />
              First count (baseline)
            </label>
            <button
              type="button"
              onClick={() => void session.open(baseline)}
              disabled={session.busy}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-royal-green)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> Start count
            </button>
          </>
        )}
      </div>

      {banner && (
        <div className="rounded-md border border-forest-soft/30 bg-forest-soft/10 px-3 py-2 text-xs text-forest-soft">
          {banner}
        </div>
      )}

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

      {(error || session.error) && (
        <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error ?? session.error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-xs text-cream/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deriving checklist…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] py-10 text-center text-sm text-cream/45">
          Nothing here — this station has no {kind} items mapped.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2 text-right">On hand</th>
                {counting && <th className="px-3 py-2 text-right">Count</th>}
                <th className="px-3 py-2">{counting ? 'Status' : 'Last count'}</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">Par</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const cls = r.count_class ? COUNT_CLASS_META[r.count_class] : null
                const counted = session.counts[r.nomenclature_id] ?? null
                const barValue = counting ? counted : r.last_count
                return (
                  <tr
                    key={r.nomenclature_id}
                    className="border-b border-[var(--line)] last:border-none"
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-cream">{r.name}</span>
                      <span className="block text-[10px] text-cream/30">{r.product_code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {cls ? (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls.badgeCls}`}>
                          {cls.label}
                        </span>
                      ) : (
                        <span className="text-cream/30">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-cream/80">
                      {fmtQty(r.batch_on_hand, r.base_unit)}
                    </td>
                    {counting && (
                      <td className="px-3 py-2.5 text-right">
                        <InlineEditCell<number | null>
                          value={counted}
                          variant="number"
                          min={0}
                          align="right"
                          ariaLabel={`Count for ${r.name}`}
                          placeholder="count…"
                          className="tabular-nums font-medium text-cream"
                          onCommit={(next) => void session.record(r.nomenclature_id, next)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      {counting ? (
                        <CountZoneBar value={barValue} min={r.min_stock} par={r.par_stock} />
                      ) : r.last_count != null ? (
                        <span className="tabular-nums text-cream/70">
                          {fmtQty(r.last_count, r.base_unit)}
                          <span className="ml-1 text-[10px] text-cream/35">{fmtAge(r.last_count_at)}</span>
                        </span>
                      ) : (
                        <span className="text-cream/30">never</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <InlineEditCell<number | null>
                        value={r.min_stock}
                        variant="number"
                        min={0}
                        align="right"
                        ariaLabel={`Min for ${r.name}`}
                        placeholder="set…"
                        className="tabular-nums text-cream/70"
                        onCommit={(next) => void savePar(r.nomenclature_id, { min_stock: next })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <InlineEditCell<number | null>
                        value={r.par_stock}
                        variant="number"
                        min={0}
                        align="right"
                        ariaLabel={`Par for ${r.name}`}
                        placeholder="set…"
                        className="tabular-nums text-cream/70"
                        onCommit={(next) => void savePar(r.nomenclature_id, { par_stock: next })}
                      />
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
