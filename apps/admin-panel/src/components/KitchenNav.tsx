import { Link, useLocation } from 'react-router-dom'
import {
  ChefHat,
  Monitor,
  Factory,
  CalendarClock,
  CalendarDays,
  ChevronRight,
} from 'lucide-react'

const KITCHEN_PAGES = [
  { path: '/cook', label: 'Cook', icon: ChefHat },
  { path: '/kds', label: 'KDS', icon: Monitor },
  { path: '/production', label: 'Orders', icon: Factory },
  { path: '/planner/batch', label: 'Planner', icon: CalendarClock },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
] as const

export function KitchenNav() {
  const { pathname } = useLocation()

  return (
    <nav className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
      <Link
        to="/kitchen"
        className="shrink-0 text-slate-500 hover:text-emerald-400 transition"
      >
        Kitchen
      </Link>
      <ChevronRight className="h-3 w-3 shrink-0 text-slate-700" />
      {KITCHEN_PAGES.map(({ path, label, icon: Icon }) => {
        const isActive = pathname === path
        return (
          <Link
            key={path}
            to={path}
            className={[
              'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 transition',
              isActive
                ? 'bg-slate-800 text-emerald-300'
                : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
