import { AlertTriangle } from 'lucide-react'
import { CHART_COLORS, DOW_LABELS, HEAT_SPARSE_THRESHOLD, type HeatGrid } from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   HourHeatmap — receipts per day-of-week × hour (spec §5).

   RECEIPTS, never revenue: at ~40 receipts a week one large
   order would repaint the whole grid.

   A plain CSS grid, not a charting component — it is crisper
   at this size and every cell prints its own count, so the
   colour is a second signal rather than the only one.
   ═══════════════════════════════════════════════════════════ */

export interface HourHeatmapProps {
  grid: HeatGrid
  isLoading: boolean
}

function cellBackground(intensity: number): string {
  if (intensity <= 0) return 'var(--s-2, #171E12)'
  // Ramp the mint token's alpha rather than inventing new colours.
  const alpha = 0.12 + intensity * 0.78
  return `rgba(${CHART_COLORS.heat}, ${alpha.toFixed(3)})`
}

export function HourHeatmap({ grid, isLoading }: HourHeatmapProps) {
  const { hours, cells, totalReceipts, liveCells, avgPerLiveCell, busiestCell, isSparse } = grid

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Day &times; hour receipts</h2>
        <p className="text-xs text-cream/60">
          {isLoading
            ? 'Receipts per weekday and hour'
            : `Receipts, not revenue · ${totalReceipts} receipts over ${liveCells} active hours · ${avgPerLiveCell.toFixed(1)} per cell on average`}
        </p>
      </div>

      <div className="flex-1 overflow-x-auto px-4 py-4">
        {isLoading ? (
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
            {Array.from({ length: 84 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded-sm bg-[var(--s-2)]" />
            ))}
          </div>
        ) : hours.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-cream/60">
            No receipts in this period
          </div>
        ) : (
          <>
            <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
              <caption className="sr-only">
                Receipts by day of week and hour of day for the selected period
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-9" />
                  {hours.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="pb-1 text-center font-mono text-[9px] font-medium tabular-nums text-cream/60"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW_LABELS.map((label, i) => {
                  const isoDow = i + 1
                  return (
                    <tr key={label}>
                      <th
                        scope="row"
                        className="pr-1 text-right text-[10px] font-medium text-cream/60"
                      >
                        {label}
                      </th>
                      {hours.map((h) => {
                        const cell = cells.get(`${isoDow}-${h}`)
                        const receipts = cell?.receipts ?? 0
                        const intensity = cell?.intensity ?? 0
                        return (
                          <td
                            key={h}
                            title={`${label} ${String(h).padStart(2, '0')}:00 — ${receipts} receipt${receipts === 1 ? '' : 's'}`}
                            className="h-6 rounded-sm text-center align-middle font-mono text-[9px] tabular-nums"
                            style={{
                              backgroundColor: cellBackground(intensity),
                              // Dark ink on the brightest cells, cream on the dim ones.
                              color:
                                intensity > 0.55
                                  ? 'var(--s-0, #0A0D08)'
                                  : receipts > 0
                                    ? 'var(--color-cream, #FBF8F0)'
                                    : 'rgba(240,234,214,0.25)',
                              fontWeight: intensity > 0.55 ? 600 : 400,
                            }}
                          >
                            {receipts > 0 ? receipts : '·'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-[10px] text-cream/60">
                Busiest hour
                <span className="font-mono font-semibold tabular-nums text-cream">
                  {busiestCell}
                </span>
                receipts
              </span>

              {isSparse && (
                <span className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-watch">
                  <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
                  <span>
                    Thin evidence: {avgPerLiveCell.toFixed(1)} receipts per active hour, under{' '}
                    {HEAT_SPARSE_THRESHOLD}. Read the shape of the day, not individual squares —
                    widen the period for a firmer pattern.
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
