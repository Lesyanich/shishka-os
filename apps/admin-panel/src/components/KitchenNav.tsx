import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ChefHat,
  Monitor,
  CalendarClock,
  CalendarDays,
} from 'lucide-react'

const MANAGER_PAGES = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tasks', label: 'My Tasks', icon: ChefHat },
  { path: '/live', label: 'Kitchen Live', icon: Monitor },
  { path: '/planner/batch', label: 'Planner', icon: CalendarClock },
  { path: '/schedule', label: 'Schedule', icon: CalendarDays },
] as const

const COOK_PAGES = [
  { path: '/tasks', label: 'My Tasks', icon: ChefHat },
  { path: '/live', label: 'Kitchen Live', icon: Monitor },
] as const

export function KitchenNav() {
  const { pathname } = useLocation()
  const isCookSession = !!sessionStorage.getItem('cook_staff_id')
  const pages = isCookSession ? COOK_PAGES : MANAGER_PAGES

  return (
    <nav className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
      {pages.map(({ path, label, icon: Icon }) => {
        const isActive = pathname === path
        return (
          <Link
            key={path}
            to={path}
            className={[
              'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 transition',
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
