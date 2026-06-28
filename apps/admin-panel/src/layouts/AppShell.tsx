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
    // Staff floor — exactly what a cook sees. Manager/owner tools live in
    // 'Production & Planning' so this section mirrors the employee view.
    title: 'Staff',
    defaultOpen: true,
    items: [
      { path: '/kitchen/my-tasks', icon: ListTodo, label: 'Tasks', minRole: 'cook' },
      { path: '/kitchen/recipes', icon: BookOpen, label: 'Recipes', minRole: 'cook' },
      { path: '/kitchen/labels', icon: Tag, label: 'Labels', minRole: 'cook' },
      { path: '/staff/schedule', icon: CalendarDays, label: 'Schedule', minRole: 'cook' },
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
      // Heavy KDS production tooling — managers only, moved off the cook floor.
      { path: '/kitchen/schedule', icon: ChefHat, label: 'Kitchen KDS', minRole: 'task_manager' },
      { path: '/kitchen/tasks', icon: Timer, label: 'Cook Station', minRole: 'task_manager' },
      // Inventory/waste + receiving — owner-only, pulled off the cook floor (kept for the owner).
      { path: '/kitchen/waste', icon: Trash2, label: 'Waste', minRole: 'owner' },
      { path: '/receive', icon: ClipboardCheck, label: 'Receiving', minRole: 'owner' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { path: '/finance/dashboard', icon: LayoutDashboard, label: 'Dashboard', minRole: 'owner' },
      { path: '/finance/ledger', icon: Table2, label: 'Ledger', minRole: 'owner' },
      { path: '/finance/analytics', icon: BarChart3, label: 'Analytics', minRole: 'owner' },
      { path: '/receipts', icon: Inbox, label: 'Receipt Inbox', minRole: 'task_manager' },
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
  owner: 'bg-honey-300/15 text-honey-300 ring-1 ring-inset ring-honey-300/25',
  task_manager: 'bg-[var(--color-royal-green)]/30 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/30',
  cook: 'bg-mint-200/12 text-mint-200 ring-1 ring-inset ring-mint-200/25',
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
        className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream/40 transition hover:text-cream/70"
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
                    ? 'bg-[var(--color-royal-green)]/35 text-cream ring-1 ring-inset ring-[var(--color-forest-soft)]/30'
                    : 'text-cream/55 hover:bg-surface-3 hover:text-cream',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0',
                      isActive ? 'text-honey-300' : '',
                    ].join(' ')}
                  />
                  <span className="hidden lg:block">{label}</span>
                </>
              )}
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
    <div className="flex min-h-screen bg-[var(--s-0)]">
      {/* ─── Sidebar ─── */}
      <aside className="flex w-14 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--s-1)] lg:w-52">
        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-3 py-4">
          <span className="shk-seal h-8 w-8 text-[13px]" aria-hidden>S</span>
          <div className="hidden lg:block">
            <p className="font-display text-sm font-bold tracking-tight text-cream">Shishka OS</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-cream/40">Unified ERP / KDS</p>
          </div>
        </div>

        {/* Staff identity */}
        {!roleLoading && staffName && (
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
            <span className="hidden truncate text-xs font-medium text-cream/85 lg:block">
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
                      ? 'bg-[var(--color-royal-green)]/35 text-cream ring-1 ring-inset ring-[var(--color-forest-soft)]/30'
                      : 'text-cream/55 hover:bg-surface-3 hover:text-cream',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Settings className={['h-4 w-4 shrink-0', isActive ? 'text-honey-300' : ''].join(' ')} />
                    <span className="hidden lg:block">Settings</span>
                  </>
                )}
              </NavLink>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--line)] px-3 py-3">
          <p className="hidden text-[10px] text-cream/30 lg:block">v0.7.0 · ERP</p>
        </div>
      </aside>

      {/* ─── Main area ─── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--s-0)]/75 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-forest-soft" />
            <span className="text-xs text-cream/50">Supabase connected</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-cream/50">{today}</span>
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-cream/60">{user.email}</span>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-cream/50 transition hover:bg-surface-3 hover:text-cream"
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
