import { Navigate, Outlet } from 'react-router-dom'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'
import { hasAccess, landingFor } from '../lib/roles'

interface RoleGuardProps {
  /** Minimum role required for the wrapped routes. owner ⊃ task_manager ⊃ cook. */
  minRole: AppRole
}

/**
 * Route guard for the 3-tier RBAC model. A user below `minRole` is redirected
 * to their own role's landing page (never to a route they also can't see).
 */
export function RoleGuard({ minRole }: RoleGuardProps) {
  const { role, isLoading } = useAppRole()

  if (isLoading) return null

  if (!hasAccess(role, minRole)) {
    return <Navigate to={landingFor(role)} replace />
  }

  return <Outlet />
}

/** Redirects to the current user's role landing — used for the `*` fallback. */
export function RoleLanding() {
  const { role, isLoading } = useAppRole()
  if (isLoading) return null
  return <Navigate to={landingFor(role)} replace />
}
