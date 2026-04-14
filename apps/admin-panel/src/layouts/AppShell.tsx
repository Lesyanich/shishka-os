import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  DollarSign,
  Factory,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  Rewind,
  Rocket,
  Table2,
  Timer,
  Trash2,
  Truck,
  UtensilsCrossed,
  Brain,
  Settings,
  Target,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'

/* ─── Types ─── */

interface NavItem {
  path: string
  icon: typeof LayoutDashboard
  label: string
}

interface NavSection {
  title: string
  minRole: AppRole
  items: NavItem[]
  defaultOpen?: boolean
}

/* ─── Navigation structure ─── */

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    minRole: 'owner',
    defaultOpen: true,
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Control Center' },
      { path: '/mission', icon: Rocket, label: 'Mission Control' },
      { path: '/brain', icon: Brain, label: 'Brain' },
    ],
  },
  {
    title: 'Menu & Products',
    minRole: 'owner',
    items: [
      { path: '/menu', icon: LayoutGrid, label: 'Menu' },
      { path: '/bom', icon: GitBranch, label: 'BOM Hub' },
      { path: '/sku', icon: Package, label: 'SKU Manager' },
    ],
  },
  {
    title: 'Kitchen',
    minRole: 'cook',
    defaultOpen: true,
    items: [
      { path: '/kitchen/schedule', icon: ChefHat, label: 'Kitchen KDS' },
      { path: '/kitchen/tasks', icon: Timer, label: 'Cook Station' },
      { path: '/kitchen/waste', icon: Trash2, label: 'Waste' },
      { path: '/schedule', icon: CalendarClock, label: 'Schedule' },
    ],
  },
  {
    title: 'Production',
    minRole: 'cook',
    items: [
      { path: '/planner', icon: CalendarDays, label: 'Planner' },
      { path: '/planner/batch', icon: Rewind, label: 'Batch Plan' },
      { path: '/production', icon: Factory, label: 'Production' },
      { path: '/targets', icon: Target, label: 'Targets' },
      { path: '/receive', icon: ClipboardCheck, label: 'Receiving' },
      { path: '/procurement', icon: Truck, label: 'Procurement' },
    ],
  },
  {
    title: 'Finance',
    minRole: 'owner',
    items: [
      { path: '/finance/ledger', icon: Table2, label: 'Ledger' },
      { path: '/finance/analytics', icon: BarChart3, label: 'Analytics' },
      { path: '/receipts', icon: Inbox, label: 'Receipt Inbox' },
      { path: '/api-costs', icon: DollarSign, label: 'API Costs' },
    ],
  },
  {
    title: 'Settings',
    minRole: 'owner',
    items: [
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

/* ─── Role badge ─── */

const ROLE_STYLE: Record<AppRole, string> = {
  owner: 'bg-amber-500/15 text-amber-300',
  cook: 'bg-sky-500/15 text-sky-300',
}

/* ─── Collapsible section ─── */

function SidebarSection({
  section,
  isOpen,
  onToggle,
}: {
  section: NavSection
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-400"
      >
        <span className="hidden lg:block">{section.title}</span>
        <ChevronDown
          className={[
            'hidden h-3 w-3 transition-transform lg:block',
            isOpen ? '' : '-rotate-90',
          ].join(' ')}
        />
      </button>
      {isOpen && (
        <div className="flex flex-col gap-0.5">
          {section.items.map(({ path, icon: Icon, label }) => (
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
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── AppShell ─── */

export function AppShell() {
  const { user, signOut } = useAuth()
  const { role, staffName, isLoading: roleLoading } = useAppRole()

  const visibleSections = NAV_SECTIONS.filter(
    (s) => role === 'owner' || s.minRole === 'cook',
  )

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {}
      for (const s of NAV_SECTIONS) {
        initial[s.title] = s.defaultOpen ?? true
      }
      return initial
    },
  )

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))
  }

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

        {/* Staff identity */}
        {!roleLoading && staffName && (
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
            <span className="hidden truncate text-xs font-medium text-slate-300 lg:block">
              {staffName}
            </span>
            <span
              className={[
                'hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase lg:inline-block',
                ROLE_STYLE[role],
              ].join(' ')}
            >
              {role}
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
          {visibleSections.map((section) => (
            <SidebarSection
              key={section.title}
              section={section}
              isOpen={openSections[section.title] ?? true}
              onToggle={() => toggleSection(section.title)}
            />
          ))}

          {/* Settings — always visible, outside sections */}
          <div className="mt-auto">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-2 py-2 text-xs font-medium transition',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                ].join(' ')
              }
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">Settings</span>
            </NavLink>
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-3 py-3">
          <p className="hidden text-[10px] text-slate-700 lg:block">v0.7.0 · ERP</p>
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
                  title="Sign out"
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
