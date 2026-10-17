import { Trash2 } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import type { WasteSummary } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   WasteByReasonChart — binned stock by reason, with the liability
   split (spec §5 Tab 3).

   Empty on prod because `waste_logs` has no rows at all: the table,
   the enum and the WasteTracker screen exist, but nobody has logged
   anything (Phase 0.4). The panel says that instead of drawing a
   reassuring zero, because "no waste recorded" and "no waste" are
   very different claims.
   ═══════════════════════════════════════════════════════════════════ */

export interface WasteByReasonChartProps {
  summary: WasteSummary
  isLoading: boolean
}

const REASON_LABEL: Record<string, string> = {
  expiration: 'Expired',
  spillage_damage: 'Spilled or damaged',
  quality_reject: 'Quality reject',
  rd_testing: 'R&D / testing',
}

export function WasteByReasonChart({ summary, isLoading }: WasteByReasonChartProps) {
  const max = summary.byReason[0]?.thb ?? 0

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Waste</h2>
        <p className="text-xs text-cream/60">
          {isLoading || summary.entries === 0
            ? 'By reason, with the liability split'
            : `฿${formatTHBFull(summary.totalThb)} over ${summary.entries} entries, ${summary.weeks} week${summary.weeks === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : summary.entries === 0 ? (
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-watch" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-cream">No waste has been logged</p>
              <p className="mt-1 text-xs leading-relaxed text-cream/80">
                Not &ldquo;no waste&rdquo; — <strong className="font-semibold">none recorded</strong>.
                There are zero entries in the waste log, so every variance this tab reports counts
                binned stock as missing stock.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-cream/60">
                The log, its reasons and the Waste screen all exist; logging them is the open floor
                routine (spec §0.4).
              </p>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {summary.byReason.map((r) => (
                <li key={r.reason} className="relative">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded bg-brick-bright/15"
                    style={{ width: max > 0 ? `${(r.thb / max) * 100}%` : 0 }}
                  />
                  <div className="relative flex items-center gap-2 px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate text-xs text-cream">
                      {REASON_LABEL[r.reason] ?? r.reason}
                    </span>
                    <span className="w-10 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-cream/60">
                      {r.entries}
                    </span>
                    <span className="w-20 flex-shrink-0 text-right font-mono text-xs tabular-nums text-cream">
                      ฿{formatTHBFull(r.thb)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-3 border-t border-[var(--line)] pt-2 text-[10px] text-cream/60">
              Liability — café ฿{formatTHBFull(summary.liability.cafe)} · employee ฿
              {formatTHBFull(summary.liability.employee)} · supplier ฿
              {formatTHBFull(summary.liability.supplier)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
