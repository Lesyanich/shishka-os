import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface StaffMember {
  id: string
  name: string
  role: string
}

const MANAGEMENT: StaffMember[] = [
  { id: 'lesia', name: 'Lesia', role: 'CEO' },
  { id: 'bas', name: 'Bas', role: 'Operations' },
]

function formatRole(role: string): string {
  const map: Record<string, string> = {
    cook: 'Cook',
    sous_chef: 'Sous Chef',
    admin: 'Admin',
    dishwasher: 'Dishwasher',
    prep: 'Prep',
  }
  return map[role] ?? role.charAt(0).toUpperCase() + role.slice(1)
}

export function useStaffList(): { people: StaffMember[]; isLoading: boolean } {
  const [people, setPeople] = useState<StaffMember[]>(MANAGEMENT)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchStaff() {
      setIsLoading(true)

      const { data, error } = await supabase
        .from('staff')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name')

      if (cancelled) return

      if (error) {
        console.error('[useStaffList] fetch error', error)
        setIsLoading(false)
        return
      }

      const staffFromDb: StaffMember[] = (data ?? []).map(
        (row: { id: string; name: string; role: string }) => ({
          id: row.id,
          name: row.name,
          role: formatRole(row.role),
        }),
      )

      setPeople([...MANAGEMENT, ...staffFromDb])
      setIsLoading(false)
    }

    fetchStaff()

    return () => {
      cancelled = true
    }
  }, [])

  return { people, isLoading }
}
