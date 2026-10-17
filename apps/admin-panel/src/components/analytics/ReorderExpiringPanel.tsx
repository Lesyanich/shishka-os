import { PackageX, Timer } from 'lucide-react'
import type { ReplenishmentRow, StockStatusRow } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   ReorderExpiringPanel — compact reuse of v_station_replenishment and
   v_stock_status (spec §5 Tab 3: "no new logic").

   Both lists are live state rather than period-scoped, so the period
   selector does not apply to them and the panel says so.
   ═══════════════════════════════════════════════════════════════════ */

export interface ReorderExpiringPanelProps {
  reorder: ReplenishmentRow[]
  expiring: StockStatusRow[]
  isLoading: boolean
}

export function ReorderExpiringPanel({ reorder, expiring, isLoading }: ReorderExpiringPanelProps) {
  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Reorder &amp; expiring</h2>
        <p className="text-xs text-cream/60">
          <span className="text-amber-watch">Live stock state — not affected by the period above</span>
        </p>
      </div>

      <div className="flex-1 divide-y divide-[var(--line)]">
        {/* Reorder */}
        <div className="px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-cream/60">
            <PackageX className="h-3 w-3" /> Below par
          </p>
          {isLoading ? (
            <div className="h-5 animate-pulse rounded bg-[var(--s-2)]" />
          ) : reorder.length === 0 ? (
            <p className="text-xs text-cream/60">Nothing below par right now</p>
          ) : (
            <ul className="space-y-1">
              {reorder.map((r) => (
                <li key={`${r.nomenclature_id}-${r.location_name}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-cream" title={r.product_code}>
                    {r.name}
                  </span>
                  {r.location_name && (
                    <span className="flex-shrink-0 text-[10px] text-cream/60">{r.location_name}</span>
                  )}
                  {r.stock_status && (
                    <span className="flex-shrink-0 text-[9px] uppercase tracking-wider text-brick-bright">
                      {r.stock_status}
                    </span>
                  )}
                  <span className="w-16 flex-shrink-0 text-right font-mono text-xs tabular-nums text-cream">
                    {r.suggested_qty} {r.base_unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Expiring */}
        <div className="px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-cream/60">
            <Timer className="h-3 w-3" /> Expiring or expired
          </p>
          {isLoading ? (
            <div className="h-5 animate-pulse rounded bg-[var(--s-2)]" />
          ) : expiring.length === 0 ? (
            <p className="text-xs text-cream/60">Nothing flagged as expiring or expired</p>
          ) : (
            <ul className="space-y-1">
              {expiring.map((r) => (
                <li key={r.nomenclature_id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-cream" title={r.product_code}>
                    {r.name}
                  </span>
                  {r.storage_location && (
                    <span className="flex-shrink-0 text-[10px] text-cream/60">
                      {r.storage_location}
                    </span>
                  )}
                  {r.expired > 0 && (
                    <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-brick-bright">
                      {r.expired} expired
                    </span>
                  )}
                  {r.expiring_soon > 0 && (
                    <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-amber-watch">
                      {r.expiring_soon} soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
