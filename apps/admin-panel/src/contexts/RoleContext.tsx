import { createContext, useContext, useState, type ReactNode } from 'react'

export type AppRole = 'lesia' | 'bas' | 'chef'

interface RoleContextValue {
  role: AppRole
  setRole: (role: AppRole) => void
}

const STORAGE_KEY = 'shishka-role'

function getInitialRole(): AppRole {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'lesia' || stored === 'bas' || stored === 'chef') return stored
  return 'lesia'
}

const RoleContext = createContext<RoleContextValue>({
  role: 'lesia',
  setRole: () => {},
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(getInitialRole)

  const setRole = (r: AppRole) => {
    setRoleState(r)
    localStorage.setItem(STORAGE_KEY, r)
  }

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
