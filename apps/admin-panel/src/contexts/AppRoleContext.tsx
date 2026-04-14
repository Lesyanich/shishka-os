import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export type AppRole = 'owner' | 'cook'

interface AppRoleState {
  role: AppRole
  staffId: string | null
  staffName: string | null
  isLoading: boolean
}

const AppRoleContext = createContext<AppRoleState>({
  role: 'cook',
  staffId: null,
  staffName: null,
  isLoading: true,
})

export function AppRoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [state, setState] = useState<AppRoleState>({
    role: 'cook',
    staffId: null,
    staffName: null,
    isLoading: true,
  })

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setState({ role: 'cook', staffId: null, staffName: null, isLoading: false })
      return
    }

    let cancelled = false

    supabase.rpc('fn_get_my_role').then(({ data, error }) => {
      if (cancelled) return
      if (error || !data || data.length === 0) {
        // User not in staff table — safe default
        setState({ role: 'cook', staffId: null, staffName: null, isLoading: false })
        return
      }
      const row = data[0]
      setState({
        role: row.app_role as AppRole,
        staffId: row.staff_id,
        staffName: row.staff_name,
        isLoading: false,
      })
    })

    return () => { cancelled = true }
  }, [user, authLoading])

  return (
    <AppRoleContext.Provider value={state}>
      {children}
    </AppRoleContext.Provider>
  )
}

export function useAppRole() {
  return useContext(AppRoleContext)
}
