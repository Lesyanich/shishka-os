import { NavLink, Outlet } from 'react-router-dom'
import { CalendarCheck, Banknote, Users } from 'lucide-react'

const TABS = [
  { to: '/hr/attendance', icon: CalendarCheck, label: 'Attendance' },
  { to: '/hr/payroll', icon: Banknote, label: 'Payroll' },
  { to: '/hr/staff', icon: Users, label: 'Staff' },
] as const

export function HRLayout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">HR &amp; Payroll</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Attendance tracking, payroll &amp; staff management
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
          {TABS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                ].join(' ')
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  )
}

export default HRLayout
