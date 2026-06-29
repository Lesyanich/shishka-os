import { NavLink, Outlet } from 'react-router-dom'
import { Table2, BarChart3, LayoutDashboard } from 'lucide-react'
import { FinanceProvider } from '../contexts/FinanceContext'

const TABS = [
  { to: '/finance/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/finance/ledger', icon: Table2, label: 'Ledger' },
  { to: '/finance/analytics', icon: BarChart3, label: 'Analytics' },
] as const

export function FinanceLayout() {
  return (
    <FinanceProvider>
      <div className="menu-canvas -mx-4 space-y-5 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
        {/* Header + Tab Navigation */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="shk-seal" aria-hidden>S</span>
            <div>
              <div className="shk-eyebrow">Finance &middot; control</div>
              <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
                Finance
              </h1>
              <p className="mt-1.5 text-sm text-cream/45">
                Expense ledger, receipt processing &amp; analytics
              </p>
            </div>
          </div>
          <nav className="shk-seg" role="group" aria-label="Finance view">
            {TABS.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className="shk-seg-btn" title={`${label} view`}>
                <Icon className="shk-seg-ico h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <Outlet />
      </div>
    </FinanceProvider>
  )
}

export default FinanceLayout
