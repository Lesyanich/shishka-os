import { Construction } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   AnalyticsPlaceholderTab — the Purchases (S3) and Stock
   control (S4) tabs before they are built.

   Deliberately reachable rather than disabled: the shell is
   then verifiable end to end, and the owner can see what is
   coming instead of clicking a dead control.
   ═══════════════════════════════════════════════════════════ */

export interface AnalyticsPlaceholderTabProps {
  title: string
  /** Mission Control task that ships this tab. */
  taskId: string
  phase: string
  /** What the tab will show once built — straight from the spec. */
  widgets: string[]
  /** Anything that must happen on the floor before it can say anything true. */
  prerequisite?: string
}

export function AnalyticsPlaceholderTab({
  title,
  taskId,
  phase,
  widgets,
  prerequisite,
}: AnalyticsPlaceholderTabProps) {
  return (
    <div className="shk-panel px-5 py-6">
      <div className="flex items-start gap-3">
        <Construction className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-watch" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-cream">{title} — not built yet</h2>
          <p className="mt-1 text-xs text-cream/60">
            Ships in <span className="font-medium text-cream/80">{phase}</span> (Mission Control{' '}
            <code className="font-mono text-[11px] text-honey-300">{taskId}</code>). The period
            selector above already applies to it; this tab is empty on purpose rather than hidden,
            so nothing here is a number you could mistake for data.
          </p>

          <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-cream/60">
            Planned widgets
          </p>
          <ul className="mt-1.5 space-y-1">
            {widgets.map((w) => (
              <li key={w} className="flex items-start gap-2 text-xs text-cream/80">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-cream/40" aria-hidden />
                {w}
              </li>
            ))}
          </ul>

          {prerequisite && (
            <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2 text-xs text-cream/80">
              <span className="font-semibold text-amber-watch">Blocked on the floor:</span>{' '}
              {prerequisite}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── The two concrete tabs, so App.tsx stays declarative ─── */

export function PurchasesTabPlaceholder() {
  return (
    <AnalyticsPlaceholderTab
      title="Purchases"
      phase="S3"
      taskId="399488b2"
      widgets={[
        'Coverage strip — THB purchased, share on canonical items, lines awaiting match',
        'Weekly spend, stacked by purchase category, canonical vs stub',
        'Purchases ÷ revenue % per week — the crude actual food cost, target band 28–35 %',
        'Supplier table — THB, lines, share, last delivery, Δ vs previous period',
        'Price watch — A-class items more than 10 % over their 8-week median',
        'Top-20 items by spend, with class and "no BOM" badges',
      ]}
    />
  )
}

export function StockControlTabPlaceholder() {
  return (
    <AnalyticsPlaceholderTab
      title="Stock control"
      phase="S4"
      taskId="d8c02f8c"
      widgets={[
        'Variance table — opening + purchases − usage − waste = expected vs counted, per A-item',
        'Food cost: theoretical vs actual per week, with the unexplained gap shaded',
        'Inventory value on hand at the last count, by location',
        'Waste by reason per week, with the liability split',
        'Reorder and expiring-soon lists, reusing the existing stock views',
      ]}
      prerequisite="the variance model needs at least two complete count days on prod. One exists (2026-09-01); the weekly A-class count SOP is Nene's, tracked as MC 1cd6366c. Until the second count lands this tab can only show coverage, waste and inventory value."
    />
  )
}
