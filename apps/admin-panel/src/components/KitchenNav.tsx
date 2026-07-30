import { Link, useLocation } from 'react-router-dom'
import {
  ChefHat,
  ListTodo,
  Tag,
  Trash2,
  CalendarDays,
  PackageOpen,
} from 'lucide-react'
import { useAppRole } from '../contexts/AppRoleContext'

// Cooks get the lean kitchen set (tasks + reference stations). The heavy KDS
// planner (Gantt / production scheduling) is hidden from cooks and kept for
// managers only.
const COOK_PAGES = [
  { path: '/kitchen/my-tasks', label: 'Tasks', icon: ListTodo },
  { path: '/kitchen/recipes', label: 'Recipes', icon: ChefHat },
  { path: '/kitchen/labels', label: 'Labels', icon: Tag },
  { path: '/kitchen/waste', label: 'Waste', icon: Trash2 },
] as const

const MANAGER_PAGES = [
  { path: '/kitchen/my-tasks', label: 'Tasks', icon: ListTodo },
  { path: '/kitchen/recipes', label: 'Recipes', icon: ChefHat },
  { path: '/kitchen/schedule', label: 'Schedule', icon: CalendarDays },
  { path: '/receive', label: 'Receiving', icon: PackageOpen },
] as const

export function KitchenNav() {
  const { pathname } = useLocation()
  const { role } = useAppRole()
  const pages = role === 'cook' ? COOK_PAGES : MANAGER_PAGES

  return (
    <nav className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
      {pages.map(({ path, label, icon: Icon }) => {
        const isActive = pathname === path || pathname.startsWith(`${path}/`)
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
