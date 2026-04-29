import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brain, Sparkles, MapPin, DollarSign, Activity } from 'lucide-react'
import { BrainPulseBar } from './components/BrainPulseBar'
import { BrainErrorBoundary } from '../../components/brain/BrainErrorBoundary'

const TABS = [
  // Unified explore view = graph + reader side-by-side, default landing
  { to: '/brain', label: 'Brain', icon: Sparkles, end: true },
  // Other surfaces: Drive Map, Cost, Quality
  { to: '/brain/drive', label: 'Drive Map', icon: MapPin },
  { to: '/brain/cost', label: 'Cost', icon: DollarSign },
  { to: '/brain/quality', label: 'Quality', icon: Activity },
]

export function BrainPage() {
  const location = useLocation()
  // Use the route path as the boundary key so a thrown error on one tab
  // doesn't persist into a different tab — switching tabs resets the boundary.
  const scope =
    location.pathname.replace(/^\/brain\/?/, '').split('/')[0] || 'Map'
  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-300">
          <Brain className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Brain</h1>
          <p className="text-xs text-slate-500">
            Map · Pages · Drive · Cost · Quality
          </p>
        </div>
      </header>

      <div className="mb-3">
        <BrainPulseBar />
      </div>

      <nav className="mb-4 flex gap-1 border-b border-slate-800">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition',
                isActive
                  ? 'border-fuchsia-400 text-fuchsia-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
              ].join(' ')
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1 min-h-0">
        <BrainErrorBoundary key={location.pathname} scope={scope}>
          <Outlet />
        </BrainErrorBoundary>
      </div>
    </div>
  )
}
