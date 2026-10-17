import { AlertTriangle } from 'lucide-react'
import { formatTHBFull } from '../finance/helpers'
import type { InventoryValueSummary } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   InventoryValueTile — THB on hand at the last count, by location
   (spec §5 Tab 3).

   Two disclosures, both measured on prod: some counted lines have no
   cost on file, so the total is a FLOOR; and the count is weeks old,
   which for fridge produce matters more than the number itself.
   ═══════════════════════════════════════════════════════════════════ */

export interface InventoryValueTileProps {
  summary: InventoryValueSummary
  isLoading: boolean
}

export function InventoryValueTile({ summary, isLoading }: InventoryValueTileProps) {
  const max = summary.byLocation[0]?.valueThb ?? 0

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Inventory value</h2>
        <p className="text-xs text-cream/60">
          {isLoading || !summary.countedOn
            ? 'At the last stock count, by location'
            : `At the count of ${summary.countedOn}${summary.daysSinceCount !== null ? ` · ${summary.daysSinceCount} days ago` : ''}`}
        </p>
      </div>

      <div className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : summary.lines === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-cream/60">
            No stock count on record
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-honey-300">
                ฿{formatTHBFull(summary.totalThb)}
              </span>
              <span className="text-[10px] text-cream/60">
                over {summary.lines} counted lines
              </span>
            </div>

            <ul className="space-y-1.5">
              {summary.byLocation.map((l) => (
                <li key={l.location} className="relative">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded bg-[var(--color-forest-soft)]/12"
                    style={{ width: max > 0 ? `${(l.valueThb / max) * 100}%` : 0 }}
                  />
                  <div className="relative flex items-center gap-2 px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate text-xs text-cream">{l.location}</span>
                    {l.linesWithoutCost > 0 && (
                      <span
                        className="flex-shrink-0 text-[9px] uppercase tracking-wider text-amber-watch"
                        title={`${l.linesWithoutCost} of ${l.lines} lines here have no cost on file`}
                      >
                        {l.linesWithoutCost} uncosted
                      </span>
                    )}
                    <span className="w-20 flex-shrink-0 text-right font-mono text-xs tabular-nums text-cream">
                      ฿{formatTHBFull(l.valueThb)}
                    </span>
                    <span className="w-10 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-cream/60">
                      {l.lines}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!isLoading && summary.lines > 0 && (summary.linesWithoutCost > 0 || summary.stubLines > 0) && (
        <p className="flex items-start gap-1.5 border-t border-[var(--line)] px-4 py-2 text-[10px] leading-snug text-amber-watch">
          <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0" />
          <span>
            {summary.linesWithoutCost > 0 && (
              <>
                <strong className="font-semibold">
                  {summary.linesWithoutCost} of {summary.lines}
                </strong>{' '}
                counted lines hold stock with no cost on file and count as zero here, so this total
                is a floor, not the holding.{' '}
                {summary.linesCountedEmpty > 0 && (
                  <>
                    ({summary.linesCountedEmpty} further line
                    {summary.linesCountedEmpty === 1 ? ' was' : 's were'} counted and genuinely
                    empty — that zero is correct.){' '}
                  </>
                )}
              </>
            )}
            {summary.stubLines > 0 && (
              <>
                ฿{formatTHBFull(summary.stubThb)} of it sits on {summary.stubLines} auto-created
                stub item{summary.stubLines === 1 ? '' : 's'}.
              </>
            )}
          </span>
        </p>
      )}
    </div>
  )
}
