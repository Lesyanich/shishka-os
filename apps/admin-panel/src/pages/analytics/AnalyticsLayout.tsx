import { NavLink, Outlet } from 'react-router-dom'
import { Activity, PackageSearch, ShoppingBasket } from 'lucide-react'
import { AnalyticsPeriodProvider, useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import { PERIOD_CHOICES, type PeriodWeeks } from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   AnalyticsLayout — the /analytics shell (spec §5, hub §2).

   Owner-only (gated by the RoleGuard around the route in
   App.tsx). Three tabs are registered from the start; only
   Sales pulse is implemented in S2 — Purchases is S3 and
   Stock control is S4, both rendering an explicit placeholder
   rather than being hidden, so the shell is verifiable whole.
   ═══════════════════════════════════════════════════════════ */

const TABS = [
  { to: '/analytics/sales', icon: Activity, label: 'Sales pulse' },
  { to: '/analytics/purchases', icon: ShoppingBasket, label: 'Purchases' },
  { to: '/analytics/stock', icon: PackageSearch, label: 'Stock control' },
] as const

function PeriodSelector() {
  const { weeks, setWeeks } = useAnalyticsPeriod()

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-cream/60">Period</span>
      <div className="shk-seg" role="group" aria-label="Analytics period">
        {PERIOD_CHOICES.map((w: PeriodWeeks) => (
          <button
            key={w}
            type="button"
            onClick={() => setWeeks(w)}
            aria-pressed={weeks === w}
            className="shk-seg-btn"
            title={`Last ${w} ISO weeks`}
          >
            {w}w
          </button>
        ))}
      </div>
    </div>
  )
}

export function AnalyticsLayout() {
  return (
    <AnalyticsPeriodProvider>
      <div className="menu-canvas -mx-4 space-y-5 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
        {/* Header + tab navigation */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="shk-seal" aria-hidden>
              S
            </span>
            <div>
              <div className="shk-eyebrow">Analytics &middot; control</div>
              <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
                Analytics
              </h1>
              <p className="mt-1.5 text-sm text-cream/60">
                Sales, purchases &amp; stock control &mdash; weekly grain
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector />
            <nav className="shk-seg" role="group" aria-label="Analytics view">
              {TABS.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className="shk-seg-btn" title={`${label} view`}>
                  <Icon className="shk-seg-ico h-3.5 w-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab content */}
        <Outlet />
      </div>
    </AnalyticsPeriodProvider>
  )
}

export default AnalyticsLayout
