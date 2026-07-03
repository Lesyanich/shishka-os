import { FileCheck2, Loader2 } from 'lucide-react'
import { useStocktakeSessions } from '../../hooks/useStocktakeSessions'
import { SESSION_STATUS_META, type Station } from '../../types/stations'

/** Stocktake document history (CEO: every count must be documented).
 * Read-only in S1; S2/S3 add the count + review flows that feed it. */
export function StocktakeSessionsPanel({ stations }: { stations: Station[] }) {
  const { sessions, isLoading, error } = useStocktakeSessions()

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name ?? '—'

  const fmtDateTime = (iso: string | null): string =>
    iso
      ? new Date(iso).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—'

  const fmtVariance = (v: number | null): string => {
    if (v == null) return '—'
    const rounded = Math.round(v)
    return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()} ฿`
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-cream/45" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
          Stocktake documents
        </h3>
      </div>

      {error && (
        <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-xs text-cream/45">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading documents…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-6 text-center text-xs text-cream/45">
          No stocktakes yet. Pick a station above and run the first count — every
          count becomes an auditable document here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--s-1)] text-[10px] uppercase tracking-wide text-cream/45">
                <th className="px-3 py-2">Doc</th>
                <th className="px-3 py-2">Station</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2 text-right">Lines</th>
                <th className="px-3 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const meta = SESSION_STATUS_META[s.status]
                return (
                  <tr key={s.id} className="border-b border-[var(--line)] last:border-none">
                    <td className="px-3 py-2 font-medium tabular-nums text-cream">
                      {s.doc_number}
                      {s.is_baseline && (
                        <span className="ml-1.5 rounded bg-[var(--s-2)] px-1 py-0.5 text-[9px] text-cream/50">
                          baseline
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-cream/80">{stationName(s.station_id)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${meta.badgeCls}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-cream/60">{fmtDateTime(s.opened_at)}</td>
                    <td className="px-3 py-2 text-cream/60">{s.counted_by ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-cream/80">
                      {s.entries_count ?? '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        (s.variance_value_thb ?? 0) < 0
                          ? 'text-brick-bright'
                          : (s.variance_value_thb ?? 0) > 0
                            ? 'text-forest-soft'
                            : 'text-cream/60'
                      }`}
                    >
                      {fmtVariance(s.variance_value_thb)}
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
