import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { StaffMember } from '../types/staff'

interface CookContextValue {
  cook: StaffMember | null
  login: (staff: StaffMember) => void
  logout: () => void
}

const CookContext = createContext<CookContextValue | undefined>(undefined)

export function CookProvider({ children }: { children: ReactNode }) {
  const [cook, setCook] = useState<StaffMember | null>(null)

  const login = useCallback((staff: StaffMember) => {
    setCook(staff)
  }, [])

  const logout = useCallback(() => {
    setCook(null)
  }, [])

  return (
    <CookContext.Provider value={{ cook, login, logout }}>
      {children}
    </CookContext.Provider>
  )
}

export function useCook() {
  const ctx = useContext(CookContext)
  if (!ctx) throw new Error('useCook must be used within CookProvider')
  return ctx
}
