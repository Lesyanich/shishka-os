import { Navigate, Outlet } from 'react-router-dom'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'

interface RoleGuardProps {
  minRole: AppRole
}

// Cooks landing route — the "My Tasks" / CookStation view.
// Kept in one place so future renames stay in sync.
export const COOK_LANDING_PATH = '/kitchen/tasks'

/**
 * Route guard that redirects unauthorized roles.
 * minRole='owner' redirects cook users to the cook landing path.
 */
export function RoleGuard({ minRole }: RoleGuardProps) {
  const { role, isLoading } = useAppRole()

  if (isLoading) return null

  if (minRole === 'owner' && role !== 'owner') {
    return <Navigate to={COOK_LANDING_PATH} replace />
  }

  return <Outlet />
}
