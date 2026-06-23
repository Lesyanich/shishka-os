import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deriveClockStatus, toISODate, type ClockEvent } from '../lib/staffSchedule'

export type { ClockEvent } from '../lib/staffSchedule'

export interface UseShiftClockResult {
  todayEvents: ClockEvent[]
  isClockedIn: boolean
  lastEvent: ClockEvent | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  clock: (type: 'clock_in' | 'clock_out') => Promise<boolean>
  refetch: () => void
}

/**
 * Today's clock-in/out state for one staff member.
 * Punches are written exclusively through the `fn_clock` RPC, which resolves
 * the staff_id server-side from auth.uid() — the client never supplies it.
 */
export function useShiftClock(staffId: string | null): UseShiftClockResult {
  const [todayEvents, setTodayEvents] = useState<ClockEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchToday = useCallback(async () => {
    if (!staffId) {
      setTodayEvents([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('shift_clock_events')
      .select('id, staff_id, shift_id, event_type, event_at, source, note, created_at')
      .eq('staff_id', staffId)
      .gte('event_at', `${toISODate(new Date())}T00:00:00`)
      .order('event_at', { ascending: true })

    if (fetchError) {
      console.error('[useShiftClock] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setTodayEvents((data ?? []) as ClockEvent[])
    setIsLoading(false)
  }, [staffId])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  const clock = useCallback(
    async (type: 'clock_in' | 'clock_out'): Promise<boolean> => {
      setIsSaving(true)
      setError(null)
      const { error: rpcError } = await supabase.rpc('fn_clock', { p_event_type: type })
      setIsSaving(false)
      if (rpcError) {
        console.error('[useShiftClock] clock error', rpcError)
        setError(rpcError.message)
        return false
      }
      await fetchToday()
      return true
    },
    [fetchToday],
  )

  const { isClockedIn, lastEvent } = deriveClockStatus(todayEvents)

  return { todayEvents, isClockedIn, lastEvent, isLoading, isSaving, error, clock, refetch: fetchToday }
}

// ─── Week schedule (own shifts + the whole team's days off) ───

export interface RosterMember {
  id: string
  name: string
  app_role: string
}

export interface WeekShift {
  id: string
  staff_id: string
  shift_date: string
  start_time: string
  end_time: string
  status: string
}

export interface UseWeekScheduleResult {
  roster: RosterMember[]
  shifts: WeekShift[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Active staff roster + every shift in the [weekStartIso, weekEndIso] window. */
export function useWeekSchedule(weekStartIso: string, weekEndIso: string): UseWeekScheduleResult {
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [shifts, setShifts] = useState<WeekShift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWeek = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [rosterRes, shiftRes] = await Promise.all([
      supabase.from('staff').select('id, name, app_role').eq('is_active', true).order('name'),
      supabase
        .from('shifts')
        .select('id, staff_id, shift_date, start_time, end_time, status')
        .gte('shift_date', weekStartIso)
        .lte('shift_date', weekEndIso)
        .order('start_time', { ascending: true }),
    ])

    if (rosterRes.error || shiftRes.error) {
      const message = rosterRes.error?.message ?? shiftRes.error?.message ?? 'Failed to load schedule'
      console.error('[useWeekSchedule] load error', message)
      setError(message)
      setIsLoading(false)
      return
    }

    setRoster((rosterRes.data ?? []) as RosterMember[])
    setShifts((shiftRes.data ?? []) as WeekShift[])
    setIsLoading(false)
  }, [weekStartIso, weekEndIso])

  useEffect(() => {
    fetchWeek()
  }, [fetchWeek])

  return { roster, shifts, isLoading, error, refetch: fetchWeek }
}
