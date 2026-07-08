import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyStaffError } from '../lib/staffErrors'

export interface Staff {
  id: string
  name: string
  name_th: string | null
  role: 'cook' | 'sous_chef' | 'admin' | 'dishwasher' | 'prep'
  app_role: string | null
  phone: string | null
  pin_code: string | null
  is_active: boolean
  created_at: string
}

export interface StaffInsert {
  name: string
  name_th?: string | null
  role?: Staff['role']
  phone?: string | null
  pin_code?: string | null
  is_active?: boolean
}

export interface StaffUpdate {
  name?: string
  name_th?: string | null
  role?: Staff['role']
  phone?: string | null
  pin_code?: string | null
  is_active?: boolean
}

export interface UseStaffResult {
  staff: Staff[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createStaff: (data: StaffInsert) => Promise<Staff | null>
  updateStaff: (id: string, data: StaffUpdate) => Promise<Staff | null>
  deleteStaff: (id: string) => Promise<boolean>
}

const sortByName = (list: Staff[]): Staff[] =>
  [...list].sort((a, b) => a.name.localeCompare(b.name))

export function useStaff(): UseStaffResult {
  const [staff, setStaff] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('staff')
      .select('id, name, name_th, role, app_role, phone, pin_code, is_active, created_at')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('[useStaff] fetch error', fetchError)
      setError(friendlyStaffError(fetchError))
      setIsLoading(false)
      return
    }

    setStaff((data ?? []) as Staff[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Stale-page guard: refetch when the tab regains focus / becomes visible, so
  // edits are never made against a list that's been sitting open for hours.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [fetchData])

  const createStaff = useCallback(async (input: StaffInsert): Promise<Staff | null> => {
    const { data, error: insertError } = await supabase
      .from('staff')
      .insert(input)
      .select()
      .single()

    if (insertError) {
      console.error('[useStaff] insert error', insertError)
      setError(friendlyStaffError(insertError))
      return null
    }

    // Optimistic insert — no full refetch (avoids the spinner/flicker).
    const created = data as Staff
    setStaff((prev) => sortByName([...prev, created]))
    return created
  }, [])

  const updateStaff = useCallback(async (id: string, input: StaffUpdate): Promise<Staff | null> => {
    const { data, error: updateError } = await supabase
      .from('staff')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[useStaff] update error', updateError)
      setError(friendlyStaffError(updateError))
      return null
    }

    // Optimistic merge of the returned row — no full refetch.
    const updated = data as Staff
    setStaff((prev) => sortByName(prev.map((s) => (s.id === id ? updated : s))))
    return updated
  }, [])

  const deleteStaff = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('staff')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useStaff] delete error', deleteError)
      setError(friendlyStaffError(deleteError))
      return false
    }

    // Optimistic removal — no full refetch.
    setStaff((prev) => prev.filter((s) => s.id !== id))
    return true
  }, [])

  return {
    staff,
    isLoading,
    error,
    refetch: fetchData,
    createStaff,
    updateStaff,
    deleteStaff,
  }
}
