import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toISODate } from '../lib/staffSchedule'
import { aggregateByStaff, type PunctualityRow, type StaffPunctuality } from '../lib/punctuality'

export interface PunctualityStaff {
  id: string
  name: string
  role: string
  app_role: string
  monthly_salary: number | null
}

export interface UsePunctualityResult {
  staff: PunctualityStaff[]
  rows: PunctualityRow[]
  byStaff: Map<string, StaffPunctuality>
  prevByStaff: Map<string, StaffPunctuality>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, end }
}

function prevMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

const ROW_COLUMNS =
  'shift_id, staff_id, shift_date, start_time, end_time, first_in_at, first_in_local, grace_min, punch_status, late_minutes'

/**
 * Per-shift punctuality for a month (+ the previous month, for trend).
 * Reads `v_shift_punctuality` (migration 366) — a stateless read model over
 * `shift_clock_events` × `shifts`; nothing here writes attendance or payroll.
 */
export function usePunctuality(year: number, month: number): UsePunctualityResult {
  const [staff, setStaff] = useState<PunctualityStaff[]>([])
  const [rows, setRows] = useState<PunctualityRow[]>([])
  const [prevRows, setPrevRows] = useState<PunctualityRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { start, end } = monthBounds(year, month)
  const prev = prevMonthOf(year, month)
  const { start: prevStart, end: prevEnd } = monthBounds(prev.year, prev.month)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [staffRes, rowsRes, prevRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id, name, role, app_role, monthly_salary')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('v_shift_punctuality')
        .select(ROW_COLUMNS)
        .gte('shift_date', start)
        .lt('shift_date', end),
      supabase
        .from('v_shift_punctuality')
        .select(ROW_COLUMNS)
        .gte('shift_date', prevStart)
        .lt('shift_date', prevEnd),
    ])

    const failure = staffRes.error ?? rowsRes.error ?? prevRes.error
    if (failure) {
      console.error('[usePunctuality] load error', failure)
      setError(failure.message)
      setIsLoading(false)
      return
    }

    setStaff((staffRes.data ?? []) as PunctualityStaff[])
    setRows((rowsRes.data ?? []) as PunctualityRow[])
    setPrevRows((prevRes.data ?? []) as PunctualityRow[])
    setIsLoading(false)
  }, [start, end, prevStart, prevEnd])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const byStaff = useMemo(() => aggregateByStaff(rows), [rows])
  const prevByStaff = useMemo(() => aggregateByStaff(prevRows), [prevRows])

  return { staff, rows, byStaff, prevByStaff, isLoading, error, refetch: fetchData }
}

export interface UseTodayPunctualityResult {
  rows: PunctualityRow[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Today's shifts with live punch status — the "is the shop open?" strip. */
export function useTodayPunctuality(): UseTodayPunctualityResult {
  const [rows, setRows] = useState<PunctualityRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = toISODate(new Date())

  const fetchToday = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('v_shift_punctuality')
      .select(ROW_COLUMNS)
      .eq('shift_date', today)
      .order('start_time', { ascending: true })

    if (fetchError) {
      console.error('[useTodayPunctuality] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return
    }

    setRows((data ?? []) as PunctualityRow[])
    setIsLoading(false)
  }, [today])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  return { rows, isLoading, error, refetch: fetchToday }
}
