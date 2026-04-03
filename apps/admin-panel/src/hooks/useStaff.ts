import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Staff {
  id: string
  name: string
  name_th: string | null
  role: 'cook' | 'sous_chef' | 'admin' | 'dishwasher' | 'prep'
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

export function useStaff(): UseStaffResult {
  const [staff, setStaff] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('staff')
      .select('id, name, name_th, role, phone, pin_code, is_active, created_at')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('[useStaff] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setStaff((data ?? []) as Staff[])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const createStaff = useCallback(async (input: StaffInsert): Promise<Staff | null> => {
    const { data, error: insertError } = await supabase
      .from('staff')
      .insert(input)
      .select()
      .single()

    if (insertError) {
      console.error('[useStaff] insert error', insertError)
      setError(insertError.message)
      return null
    }

    await fetchData()
    return data as Staff
  }, [fetchData])

  const updateStaff = useCallback(async (id: string, input: StaffUpdate): Promise<Staff | null> => {
    const { data, error: updateError } = await supabase
      .from('staff')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[useStaff] update error', updateError)
      setError(updateError.message)
      return null
    }

    await fetchData()
    return data as Staff
  }, [fetchData])

  const deleteStaff = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('staff')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useStaff] delete error', deleteError)
      setError(deleteError.message)
      return false
    }

    await fetchData()
    return true
  }, [fetchData])

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
