import { useCallback, useEffect, useId, useState } from 'react'
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
  location?: { name: string } | null
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

const SHIFT_SELECT =
  'id, staff_id, location_id, shift_date, start_time, end_time, break_minutes, status, notes, created_at, updated_at, staff(name, role), location:locations(name)'

function mapRow(row: Record<string, unknown>): Shift {
  return {
    ...row,
    staff: row.staff as Shift['staff'],
    location: row.location as Shift['location'],
  } as Shift
}

// Keep local state in the same order as the fetch query (date asc, then start_time asc)
// so optimistic inserts land in the right grid cell / row order.
function sortShifts(list: Shift[]): Shift[] {
  return [...list].sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date < b.shift_date ? -1 : 1
    if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1
    return 0
  })
}

export function useShifts(dateFilter?: string): UseShiftsResult {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Unique per hook instance — multiple useShifts() can be mounted at once
  // (SchedulePage summary, WeekCalendar grid, BulkScheduleGenerator). Sharing one
  // channel topic makes them collide so realtime events get dropped.
  const instanceId = useId()

  const fetchData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setIsLoading(true)
      setError(null)

      let query = supabase
        .from('shifts')
        .select(SHIFT_SELECT)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true })

      if (dateFilter) {
        query = query.eq('shift_date', dateFilter)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        console.error('[useShifts] fetch error', fetchError)
        setError(fetchError.message)
        if (!opts?.silent) setIsLoading(false)
        return
      }

      setShifts((data ?? []).map((row) => mapRow(row as Record<string, unknown>)))
      if (!opts?.silent) setIsLoading(false)
    },
    [dateFilter],
  )

  // Initial load + Supabase Realtime subscription (keeps other instances / clients in sync).
  // Refetch silently so a remote change doesn't flash the whole grid back to a loading spinner.
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`shifts-realtime-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
        },
        () => {
          fetchData({ silent: true })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData, instanceId])

  const createShift = useCallback(
    async (input: ShiftInsert): Promise<Shift | null> => {
      const { data, error: insertError } = await supabase
        .from('shifts')
        .insert(input)
        .select(SHIFT_SELECT)
        .single()

      if (insertError) {
        console.error('[useShifts] insert error', insertError)
        setError(insertError.message)
        return null
      }

      const created = mapRow(data as Record<string, unknown>)
      // Optimistically reflect the new shift so the grid/summary update without a reload.
      setShifts((prev) =>
        dateFilter && created.shift_date !== dateFilter ? prev : sortShifts([...prev, created]),
      )
      return created
    },
    [dateFilter],
  )

  const updateShift = useCallback(
    async (id: string, input: ShiftUpdate): Promise<Shift | null> => {
      const { data, error: updateError } = await supabase
        .from('shifts')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SHIFT_SELECT)
        .single()

      if (updateError) {
        console.error('[useShifts] update error', updateError)
        setError(updateError.message)
        return null
      }

      const updated = mapRow(data as Record<string, unknown>)
      setShifts((prev) => {
        const next = prev.map((s) => (s.id === id ? updated : s))
        // If an edit moved the shift outside this instance's date filter, drop it.
        if (dateFilter && updated.shift_date !== dateFilter) {
          return next.filter((s) => s.id !== id)
        }
        return sortShifts(next)
      })
      return updated
    },
    [dateFilter],
  )

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

    setShifts((prev) => prev.filter((s) => s.id !== id))
    return true
  }, [])

  return {
    shifts,
    isLoading,
    error,
    refetch: () => fetchData(),
    createShift,
    updateShift,
    deleteShift,
  }
}
