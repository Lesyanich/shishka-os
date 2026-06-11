import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  generateMonthShifts,
  dateStr,
  pad2,
  type ScheduleTemplate,
} from '../lib/scheduleGen'

export interface ScheduleTemplateRow {
  id: string
  staff_id: string
  working_weekdays: number[]
  start_time: string
  end_time: string
  break_minutes: number
  location_id: string | null
  is_active: boolean
}

export interface TemplateUpsert {
  staff_id: string
  working_weekdays: number[]
  start_time: string
  end_time: string
  break_minutes: number
  location_id?: string | null
}

export interface GenerateResult {
  ok: boolean
  created: number
  error?: string
}

/** First day (YYYY-MM-DD) of the month after the given one. month is 1..12. */
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`
}

export function useScheduleTemplates() {
  const [templates, setTemplates] = useState<ScheduleTemplateRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const { data, error: fetchError } = await supabase
      .from('staff_schedule_templates')
      .select('id, staff_id, working_weekdays, start_time, end_time, break_minutes, location_id, is_active')
      .eq('is_active', true)

    if (fetchError) {
      console.error('[useScheduleTemplates] fetch error', fetchError)
      setError(fetchError.message)
    } else {
      setTemplates((data ?? []) as ScheduleTemplateRow[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('schedule-templates-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_schedule_templates' },
        () => fetchData(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchData])

  /** Upsert the (single active) template for a staff member. */
  const saveTemplate = useCallback(async (input: TemplateUpsert): Promise<boolean> => {
    const { error: upErr } = await supabase
      .from('staff_schedule_templates')
      .upsert(
        { ...input, location_id: input.location_id ?? null, is_active: true, updated_at: new Date().toISOString() },
        { onConflict: 'staff_id' },
      )
    if (upErr) {
      console.error('[useScheduleTemplates] save error', upErr)
      setError(upErr.message)
      return false
    }
    return true
  }, [])

  /**
   * Rebuild the month's planned roster from templates.
   * Idempotent: clears existing status='scheduled' shifts for the template staff in
   * that month (preserving confirmed/completed/etc.), then batch-inserts fresh ones.
   */
  const generateMonth = useCallback(
    async (year: number, month: number): Promise<GenerateResult> => {
      const start = dateStr(year, month, 1)
      const end = nextMonthStart(year, month)

      // Active templates (re-read to avoid stale closure)
      const { data: tplData, error: tplErr } = await supabase
        .from('staff_schedule_templates')
        .select('staff_id, working_weekdays, start_time, end_time, break_minutes, location_id')
        .eq('is_active', true)
      if (tplErr) return { ok: false, created: 0, error: tplErr.message }
      const tpls = (tplData ?? []) as ScheduleTemplate[]
      if (tpls.length === 0) return { ok: true, created: 0 }

      // Holidays in range (shop closed those days)
      const { data: holData, error: holErr } = await supabase
        .from('public_holidays')
        .select('holiday_date')
        .gte('holiday_date', start)
        .lt('holiday_date', end)
      if (holErr) return { ok: false, created: 0, error: holErr.message }
      const holidayDates = new Set((holData ?? []).map((h) => h.holiday_date as string))

      const rows = generateMonthShifts(year, month, tpls, holidayDates)
      const staffIds = tpls.map((t) => t.staff_id)

      // 1) clear existing planned (scheduled) shifts for these staff in the month
      const { error: delErr } = await supabase
        .from('shifts')
        .delete()
        .in('staff_id', staffIds)
        .gte('shift_date', start)
        .lt('shift_date', end)
        .eq('status', 'scheduled')
      if (delErr) return { ok: false, created: 0, error: delErr.message }

      // 2) single batch insert
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('shifts').insert(rows)
        if (insErr) return { ok: false, created: 0, error: insErr.message }
      }

      return { ok: true, created: rows.length }
    },
    [],
  )

  return { templates, isLoading, error, refetch: fetchData, saveTemplate, generateMonth }
}
