import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Shift {
  id: string
  staff_id: string
  location_id: string | null
  shift_date: string
  start_time: string
  end_time: string
  break_minutes: number
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'no_show'
  notes: string | null
  created_at: string
  updated_at: string
  staff?: { name: string; role: string } | null
}

export interface ShiftInsert {
  staff_id: string
  location_id?: string | null
  shift_date: string
  start_time: string
  end_time: string
  break_minutes?: number
  status?: Shift['status']
  notes?: string | null
}

export interface ShiftUpdate {
  staff_id?: string
  location_id?: string | null
  shift_date?: string
  start_time?: string
  end_time?: string
  break_minutes?: number
  status?: Shift['status']
  notes?: string | null
}

export interface UseShiftsResult {
  shifts: Shift[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createShift: (data: ShiftInsert) => Promise<Shift | null>
  updateShift: (id: string, data: ShiftUpdate) => Promise<Shift | null>
  deleteShift: (id: string) => Promise<boolean>
}

export function useShifts(dateFilter?: string): UseShiftsResult {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('shifts')
      .select('id, staff_id, location_id, shift_date, start_time, end_time, break_minutes, status, notes, created_at, updated_at, staff(name, role)')
      .order('shift_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (dateFilter) {
      query = query.eq('shift_date', dateFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      console.error('[useShifts] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      staff: row.staff as Shift['staff'],
    })) as Shift[]

    setShifts(mapped)
    setIsLoading(false)
  }, [dateFilter])

  // Supabase Realtime subscription
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('shifts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
        },
        () => {
          fetchData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  const createShift = useCallback(async (input: ShiftInsert): Promise<Shift | null> => {
    const { data, error: insertError } = await supabase
      .from('shifts')
      .insert(input)
      .select()
      .single()

    if (insertError) {
      console.error('[useShifts] insert error', insertError)
      setError(insertError.message)
      return null
    }

    return data as Shift
  }, [])

  const updateShift = useCallback(async (id: string, input: ShiftUpdate): Promise<Shift | null> => {
    const { data, error: updateError } = await supabase
      .from('shifts')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[useShifts] update error', updateError)
      setError(updateError.message)
      return null
    }

    return data as Shift
  }, [])

  const deleteShift = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[useShifts] delete error', deleteError)
      setError(deleteError.message)
      return false
    }

    return true
  }, [])

  return {
    shifts,
    isLoading,
    error,
    refetch: fetchData,
    createShift,
    updateShift,
    deleteShift,
  }
}
