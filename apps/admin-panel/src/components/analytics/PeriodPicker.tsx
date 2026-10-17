import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import {
  PERIOD_CHOICES,
  SALES_WINDOW_START,
  bangkokToday,
  validateRange,
  type PeriodWeeks,
} from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   PeriodPicker — the 4 / 8 / 13-week presets plus an arbitrary
   from–to day range (CEO request 2026-10-17).

   Native <input type="date"> on purpose: a real keyboard and
   mobile picker, no new dependency, and the value is already
   the `YYYY-MM-DD` the views bucket on.
   ═══════════════════════════════════════════════════════════ */

/** Month shortcuts. "This month" and "month to date" are the same window, so
 *  one of them is offered, plus a rolling 30 days, which is the other thing
 *  people reach for. */
function monthShortcuts(today: string): { label: string; from: string; to: string; title: string }[] {
  const now = new Date(`${today}T00:00:00Z`)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const firstOfThis = iso(new Date(Date.UTC(y, m, 1)))
  const firstOfLast = iso(new Date(Date.UTC(y, m - 1, 1)))
  const lastOfLast = iso(new Date(Date.UTC(y, m, 0)))
  const thirtyAgo = iso(new Date(now.getTime() - 29 * 86_400_000))

  return [
    { label: 'Month to date', from: firstOfThis, to: today, title: `${firstOfThis} – ${today}` },
    { label: 'Last month', from: firstOfLast, to: lastOfLast, title: `${firstOfLast} – ${lastOfLast}` },
    { label: 'Last 30 days', from: thirtyAgo, to: today, title: `${thirtyAgo} – ${today}` },
  ]
}

export function PeriodPicker() {
  const { selection, range, setWeeks, setCustomRange, clearCustomRange } = useAnalyticsPeriod()
  const today = bangkokToday()

  const [from, setFrom] = useState(range.start)
  const [to, setTo] = useState(range.end)

  // Keep the inputs showing whatever period is actually active, including
  // after a preset button moves it.
  useEffect(() => {
    setFrom(range.start)
    setTo(range.end)
  }, [range.start, range.end])

  const problem = validateRange(from, to, today)
  const isDirty = from !== range.start || to !== range.end

  const apply = () => {
    if (!problem) setCustomRange(from, to)
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-cream/60">Period</span>

        <div className="shk-seg" role="group" aria-label="Analytics period">
          {PERIOD_CHOICES.map((w: PeriodWeeks) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              aria-pressed={selection.mode === 'preset' && selection.weeks === w}
              className="shk-seg-btn"
              title={`Last ${w} ISO weeks`}
            >
              {w}w
            </button>
          ))}
        </div>

        {/* From–to */}
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor="analytics-from">
            From date
          </label>
          <input
            id="analytics-from"
            type="date"
            value={from}
            min={SALES_WINDOW_START}
            max={today}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={problem?.field === 'from' || undefined}
            className="rounded-md border border-[var(--line)] bg-[var(--s-1)] px-1.5 py-1 font-mono text-[11px] tabular-nums text-cream outline-none focus-visible:border-[var(--line-strong)]"
          />
          <span className="text-[10px] text-cream/60">–</span>
          <label className="sr-only" htmlFor="analytics-to">
            To date
          </label>
          <input
            id="analytics-to"
            type="date"
            value={to}
            min={SALES_WINDOW_START}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={problem?.field === 'to' || undefined}
            className="rounded-md border border-[var(--line)] bg-[var(--s-1)] px-1.5 py-1 font-mono text-[11px] tabular-nums text-cream outline-none focus-visible:border-[var(--line-strong)]"
          />

          <button
            type="button"
            onClick={apply}
            disabled={!!problem || !isDirty}
            className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-medium text-cream/80 transition hover:bg-[var(--s-2)] hover:text-cream disabled:opacity-40"
            style={{ transitionTimingFunction: 'var(--e-out)' }}
          >
            Apply
          </button>

          {selection.mode === 'custom' && (
            <button
              type="button"
              onClick={clearCustomRange}
              title="Back to the 8-week preset"
              aria-label="Clear the custom range"
              className="rounded-md border border-[var(--line)] px-1.5 py-1 text-cream/60 transition hover:bg-[var(--s-2)] hover:text-cream"
              style={{ transitionTimingFunction: 'var(--e-out)' }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {monthShortcuts(today).map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setCustomRange(s.from, s.to)}
            title={s.title}
            aria-pressed={range.start === s.from && range.end === s.to}
            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
              range.start === s.from && range.end === s.to
                ? 'border-[var(--line-strong)] bg-[var(--s-2)] text-cream'
                : 'border-[var(--line)] text-cream/60 hover:bg-[var(--s-2)] hover:text-cream'
            }`}
            style={{ transitionTimingFunction: 'var(--e-out)' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {problem && (
        <p className="flex items-center gap-1 text-[10px] text-amber-watch">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          {problem.message}
        </p>
      )}
    </div>
  )
}
