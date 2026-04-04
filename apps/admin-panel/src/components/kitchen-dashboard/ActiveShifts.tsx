import { Users } from 'lucide-react'
import type { DashboardShift } from '../../hooks/useKitchenDashboard'

const ROLE_LABELS: Record<string, string> = {
  cook: 'Cook',
  sous_chef: 'Sous Chef',
  admin: 'Admin',
  dishwasher: 'Dishwasher',
  prep: 'Prep',
}

const ROLE_COLORS: Record<string, string> = {
  cook: 'bg-emerald-500/20 text-emerald-300',
  sous_chef: 'bg-sky-500/20 text-sky-300',
  admin: 'bg-amber-500/20 text-amber-300',
  dishwasher: 'bg-slate-500/20 text-slate-300',
  prep: 'bg-violet-500/20 text-violet-300',
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-slate-600',
  confirmed: 'bg-sky-500',
  in_progress: 'bg-emerald-500',
  completed: 'bg-slate-500',
  no_show: 'bg-rose-500',
}

interface ActiveShiftsProps {
  shifts: DashboardShift[]
}

export function ActiveShifts({ shifts }: ActiveShiftsProps) {
  if (shifts.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
          <Users className="h-5 w-5 text-emerald-400" />
          On Shift
        </h2>
        <p className="text-base text-slate-500">No shifts scheduled for today</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-100">
        <Users className="h-5 w-5 text-emerald-400" />
        On Shift
        <span className="ml-auto text-sm text-slate-500">{shifts.length}</span>
      </h2>
      <div className="space-y-2">
        {shifts.map((shift) => {
          const role = shift.staff?.role ?? 'cook'
          return (
            <div
              key={shift.id}
              className="flex items-center gap-3 rounded-xl bg-slate-800/60 px-3 py-3"
            >
              <div
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[shift.status] ?? 'bg-slate-600'}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-slate-100">
                  {shift.staff?.name ?? 'Unnamed'}
                </p>
                <p className="text-sm text-slate-400">
                  {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? ROLE_COLORS.cook}`}
              >
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
