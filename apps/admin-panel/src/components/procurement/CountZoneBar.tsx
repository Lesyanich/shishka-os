import { COUNT_STATUS_META, zoneBarFill } from '../../types/stations'

/** Compact In/Low/Out zone bar: track spans 0→Par, a tick marks Min, the fill
 * (coloured by status) shows the entered/on-hand value. Shows a plain dash when
 * the item has no Min/Par set (nothing to compare against yet). */
export function CountZoneBar({
  value,
  min,
  par,
}: {
  value: number | null
  min: number | null
  par: number | null
}) {
  const { pct, minPct, status } = zoneBarFill(value, min, par)
  const meta = COUNT_STATUS_META[status]

  if (status === 'untracked') {
    return <span className="text-[10px] text-cream/30">set min/par</span>
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-[var(--s-2)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: meta.fill }}
        />
        {minPct > 0 && minPct < 100 && (
          <div
            className="absolute inset-y-0 w-px bg-cream/40"
            style={{ left: `${minPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <span className={`text-[10px] font-semibold uppercase ${meta.text}`}>{meta.label}</span>
    </div>
  )
}
