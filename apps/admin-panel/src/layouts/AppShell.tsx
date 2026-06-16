import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
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
  ShoppingCart,
  Table2,
  Tag,
  Timer,
  Trash2,
  Truck,
  UtensilsCrossed,
  Brain,
  Settings,
  SlidersHorizontal,
  Target,
  CalendarCheck,
  Banknote,
  Users,
  ListTodo,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'
import { hasAccess } from '../lib/roles'

/* ─── Types ─── */

interface NavItem {
  path: string
  icon: typeof LayoutDashboard
  label: string
  /** Minimum role to see this link. owner ⊃ task_manager ⊃ cook. */
  minRole: AppRole
}

interface NavSection {
  title: string
  items: NavItem[]
  defaultOpen?: boolean
}

/* ─── Navigation structure ─── */

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    defaultOpen: true,
    items: [
      { path: '/', icon: Rocket, label: 'Opening Roadmap', minRole: 'owner' },
      { path: '/mission', icon: Rocket, label: 'Mission Control', minRole: 'owner' },
      { path: '/brain', icon: Brain, label: 'Brain', minRole: 'owner' },
    ],
  },
  {
    title: 'Menu & Products',
    items: [
      { path: '/menu', icon: LayoutGrid, label: 'Menu', minRole: 'owner' },
      { path: '/menu/modifiers', icon: SlidersHorizontal, label: 'Modifiers', minRole: 'owner' },
      { path: '/bom', icon: GitBranch, label: 'BOM Hub', minRole: 'owner' },
      { path: '/sku', icon: Package, label: 'SKU Manager', minRole: 'owner' },
      { path: '/salad-bar', icon: LayoutGrid, label: 'Salad Bar', minRole: 'task_manager' },
    ],
  },
  {
    title: 'Kitchen',
    defaultOpen: true,
    items: [
      { path: '/kitchen/my-tasks', icon: ListTodo, label: 'My Tasks', minRole: 'cook' },
      { path: '/kitchen/recipes', icon: BookOpen, label: 'Recipes', minRole: 'cook' },
      { path: '/kitchen/schedule', icon: ChefHat, label: 'Kitchen KDS', minRole: 'cook' },
      { path: '/kitchen/tasks', icon: Timer, label: 'Cook Station', minRole: 'cook' },
      { path: '/kitchen/waste', icon: Trash2, label: 'Waste', minRole: 'cook' },
      { path: '/kitchen/labels', icon: Tag, label: 'Labels', minRole: 'cook' },
      { path: '/receive', icon: ClipboardCheck, label: 'Receiving', minRole: 'cook' },
    ],
  },
  {
    title: 'Production & Planning',
    items: [
      { path: '/schedule', icon: CalendarClock, label: 'Schedule', minRole: 'task_manager' },
      { path: '/planner', icon: CalendarDays, label: 'Planner', minRole: 'task_manager' },
      { path: '/planner/batch', icon: Rewind, label: 'Batch Plan', minRole: 'task_manager' },
      { path: '/production', icon: Factory, label: 'Production', minRole: 'task_manager' },
      { path: '/targets', icon: Target, label: 'Targets', minRole: 'task_manager' },
      { path: '/procurement', icon: Truck, label: 'Procurement', minRole: 'task_manager' },
      { path: '/shopping-list', icon: ShoppingCart, label: 'Shopping List', minRole: 'task_manager' },
      { path: '/staff-tasks', icon: ListTodo, label: 'Staff Tasks', minRole: 'task_manager' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { path: '/finance/dashboard', icon: LayoutDashboard, label: 'Dashboard', minRole: 'owner' },
      { path: '/finance/ledger', icon: Table2, label: 'Ledger', minRole: 'owner' },
      { path: '/finance/analytics', icon: BarChart3, label: 'Analytics', minRole: 'owner' },
      { path: '/receipts', icon: Inbox, label: 'Receipt Inbox', minRole: 'owner' },
      { path: '/api-costs', icon: DollarSign, label: 'API Costs', minRole: 'owner' },
    ],
  },
  {
    title: 'HR & Payroll',
    items: [
      { path: '/hr/attendance', icon: CalendarCheck, label: 'Attendance', minRole: 'owner' },
      { path: '/hr/schedule', icon: CalendarDays, label: 'Schedule', minRole: 'owner' },
      { path: '/hr/payroll', icon: Banknote, label: 'Payroll', minRole: 'owner' },
      { path: '/hr/staff', icon: Users, label: 'Staff', minRole: 'owner' },
    ],
  },
]

/* ─── Role badge ─── */

const ROLE_STYLE: Record<AppRole, string> = {
  owner: 'bg-amber-500/15 text-amber-300',
  task_manager: 'bg-violet-500/15 text-violet-300',
  cook: 'bg-sky-500/15 text-sky-300',
}

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'owner',
  task_manager: 'admin',
  cook: 'cook',
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

  const visibleSections = NAV_SECTIONS
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => hasAccess(role, i.minRole)),
    }))
    .filter((s) => s.items.length > 0)

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
              {ROLE_LABEL[role]}
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

          {/* Settings — owner only, pinned to bottom */}
          {hasAccess(role, 'owner') && (
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
          )}
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
