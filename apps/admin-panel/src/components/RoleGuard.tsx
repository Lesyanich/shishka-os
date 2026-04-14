import { Navigate, Outlet } from 'react-router-dom'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'

interface RoleGuardProps {
  minRole: AppRole
}

/**
 * Route guard that redirects unauthorized roles.
 * 'owner' routes redirect cook users to /kds (first kitchen route).
 */
export function RoleGuard({ minRole }: RoleGuardProps) {
  const { role, isLoading } = useAppRole()

  if (isLoading) return null

  if (minRole === 'owner' && role !== 'owner') {
    return <Navigate to="/kds" replace />
  }

  return <Outlet />
}
