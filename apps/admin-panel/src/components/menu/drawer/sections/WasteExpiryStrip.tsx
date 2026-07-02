import { Clock, Recycle, Snowflake } from 'lucide-react'

/** Standard kitchen waste/expiry guidance, shared by the L1 Cook, L2 Assembler
 * and Full Process surfaces (task 56b8c6dc item 4). Shelf-life comes from
 * nomenclature.shelf_life_days; the waste rule text is the house standard. */
const DEFAULT_WASTE_NOTE =
  'FIFO — oldest first · never refreeze once thawed · thawed portions hold 24h · trim/peel loss is counted in yield.'

export function WasteExpiryStrip({
  shelfLifeDays,
  storageTempLabel,
  note = DEFAULT_WASTE_NOTE,
}: {
  shelfLifeDays?: number | null
  storageTempLabel?: string | null
  note?: string
}) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cream/50">
        <Recycle className="h-3 w-3" />
        Waste &amp; Expiry
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        {shelfLifeDays != null && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Clock className="h-3 w-3 text-cream/40" /> {shelfLifeDays}d shelf-life
          </span>
        )}
        {storageTempLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Snowflake className="h-3 w-3 text-sky-400" /> {storageTempLabel}
          </span>
        )}
      </div>
      <p className="rounded-md bg-surface-2/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-cream/55">
        ♻️ {note}
      </p>
    </section>
  )
}
