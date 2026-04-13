import { Navigate, Outlet } from 'react-router-dom'
import { useCook } from '../contexts/CookContext'

export function ProtectedRoute() {
  const { cook } = useCook()

  if (!cook) return <Navigate to="/login" replace />

  return <Outlet />
}
