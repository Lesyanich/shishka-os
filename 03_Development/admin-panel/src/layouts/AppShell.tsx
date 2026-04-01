import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart2,
  CalendarClock,
  CalendarDays,
  ChefHat,
  Factory,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Rewind,
  ScanLine,
  Timer,
  Trash2,
  Truck,
  Package,
  Bell,
  ClipboardCheck,
  UtensilsCrossed,
  Settings,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface NavItem {
  path: string
  icon: typeof LayoutDashboard
  label: string
  enabled: boolean
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Control Center', enabled: true },
  { path: '/bom', icon: GitBranch, label: 'BOM Hub', enabled: true },
  { path: '/kds', icon: ChefHat, label: 'Kitchen KDS', enabled: true },
  { path: '/cook', icon: Timer, label: 'Cook Station', enabled: true },
  { path: '/waste', icon: Trash2, label: 'Waste', enabled: true },
  { path: '/logistics', icon: ScanLine, label: 'Logistics', enabled: true },
  { path: '/procurement', icon: Truck, label: 'Procurement', enabled: true },
  { path: '/sku', icon: Package, label: 'SKU Manager', enabled: true },
  { path: '/orders', icon: Bell, label: 'Orders', enabled: true },
  { path: '/planner', icon: CalendarDays, label: 'Planner', enabled: true },
  { path: '/planner/batch', icon: Rewind, label: 'Batch Plan', enabled: true },
  { path: '/production', icon: Factory, label: 'Production', enabled: true },
  { path: '/receive', icon: ClipboardCheck, label: 'Receiving', enabled: true },
  { path: '/finance', icon: Wallet, label: 'Finance', enabled: true },
  { path: '/receipts', icon: Inbox, label: 'Receipt Inbox', enabled: true },
  { path: '/schedule', icon: CalendarClock, label: 'Schedule', enabled: true },
  { path: '/analytics', icon: BarChart2, label: 'Analytics', enabled: false },
  { path: '/settings', icon: Settings, label: 'Settings', enabled: true },
]

export function AppShell() {
  const { user, signOut } = useAuth()

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* ─── Sidebar ─── */}
      <aside className="flex w-14 shrink-0 flex-col border-r border-slate-800 bg-slate-950 lg:w-52">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-3 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <UtensilsCrossed className="h-4 w-4" />
          </span>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-slate-100">Shishka OS</p>
            <p className="text-[10px] text-slate-500">Unified ERP / KDS</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV_ITEMS.map(({ path, icon: Icon, label, enabled }) =>
            enabled ? (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-lg px-2 py-2 text-xs font-medium transition',
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                  ].join(' ')
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:block">{label}</span>
              </NavLink>
            ) : (
              <div
                key={path}
                title={`${label} — coming soon`}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-xs text-slate-700"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:block">{label}</span>
              </div>
            ),
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-3 py-3">
          <p className="hidden text-[10px] text-slate-700 lg:block">v0.6.0 · Phase 8</p>
        </div>
      </aside>

      {/* ─── Main area ─── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/70 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-500">Supabase connected</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{today}</span>
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{user.email}</span>
                <button
                  onClick={signOut}
                  title="Выйти"
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
