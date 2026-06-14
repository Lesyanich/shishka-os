import { Navigate, Outlet } from 'react-router-dom'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'

interface RoleGuardProps {
  /** Gate to owners only (legacy behaviour). */
  minRole?: AppRole
  /** Explicit allow-list of roles (e.g. owner + task_manager for Staff Tasks). */
  allow?: AppRole[]
}

/** Where to send a role that isn't allowed on the requested route. */
function landingFor(role: AppRole): string {
  if (role === 'task_manager') return '/staff-tasks'
  return '/kitchen/my-tasks' // cooks land on their task board
}

/**
 * Route guard that redirects unauthorized roles to a sensible landing page.
 * Use `allow` for explicit multi-role access, or `minRole="owner"` for owner-only.
 */
export function RoleGuard({ minRole, allow }: RoleGuardProps) {
  const { role, isLoading } = useAppRole()

  if (isLoading) return null

  if (allow) {
    return allow.includes(role) ? <Outlet /> : <Navigate to={landingFor(role)} replace />
  }

  if (minRole === 'owner' && role !== 'owner') {
    return <Navigate to={landingFor(role)} replace />
  }

  return <Outlet />
}
