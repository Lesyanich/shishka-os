import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PublicHoliday {
  holiday_date: string
  name_en: string
  name_th: string | null
  kind: 'fixed' | 'lunar' | 'substitute' | 'special'
  /** false = the shop traded through this holiday, which is what earns substitute days. */
  is_company_closed: boolean
  /** false = the date still needs checking against the official published list. */
  is_confirmed: boolean
  note: string | null
  year: number
}

export interface HolidayCredit {
  id: string
  staff_id: string
  staff_name?: string
  earned_for: string
  status: 'owed' | 'used' | 'paid_out' | 'expired'
  used_on: string | null
  note: string | null
}

export interface HolidayCreditBalance {
  staff_id: string
  staff_name: string
  days_owed: number
  days_used: number
  oldest_unused: string | null
}

/**
 * The holiday calendar and the substitute-day ledger it feeds.
 *
 * The calendar is not new — `public_holidays` has existed since migration 170a
 * and `useScheduleTemplates` already skips those dates when generating shifts.
 * What migration 397 added is the ability to say we traded through one anyway,
 * and a ledger of the days off that earns.
 */
export function useHolidays(year: number) {
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [balances, setBalances] = useState<HolidayCreditBalance[]>([])
  const [credits, setCredits] = useState<HolidayCredit[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    const [holRes, balRes, credRes] = await Promise.all([
      supabase
        .from('public_holidays')
        .select('holiday_date, name_en, name_th, kind, is_company_closed, is_confirmed, note, year')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date'),
      supabase.from('v_holiday_credit_balance').select('*').order('staff_name'),
      supabase
        .from('holiday_credits')
        .select('*, staff:staff_id(name)')
        .order('earned_for'),
    ])

    if (holRes.data) setHolidays(holRes.data as unknown as PublicHoliday[])
    if (balRes.data) setBalances(balRes.data as unknown as HolidayCreditBalance[])
    if (credRes.data) {
      setCredits(
        credRes.data.map((row: Record<string, unknown>) => ({
          ...(row as unknown as HolidayCredit),
          staff_name: (row.staff as { name: string } | null)?.name ?? '—',
        })),
      )
    }
    setIsLoading(false)
  }, [year])

  useEffect(() => {
    refetch()
  }, [refetch])

  /**
   * Record whether the shop closed on a holiday. Flipping it to "we traded"
   * does not by itself create credits — a credit needs evidence that the person
   * actually worked, which is an attendance row. Sync grants them.
   */
  const setCompanyClosed = useCallback(
    async (holidayDate: string, closed: boolean) => {
      const { error } = await supabase
        .from('public_holidays')
        .update({ is_company_closed: closed, updated_at: new Date().toISOString() })
        .eq('holiday_date', holidayDate)

      if (!error) await refetch()
      return { error }
    },
    [refetch],
  )

  /** Grant substitute days for every holiday actually worked. Idempotent. */
  const syncCredits = useCallback(async () => {
    const { error } = await supabase.rpc('fn_sync_holiday_credits', {
      p_from: `${year}-01-01`,
      p_to: `${year}-12-31`,
    })

    if (!error) await refetch()
    return { error }
  }, [year, refetch])

  /** Spend a substitute day: mark the credit used on the day actually taken. */
  const markCreditUsed = useCallback(
    async (creditId: string, usedOn: string) => {
      const { error } = await supabase
        .from('holiday_credits')
        .update({ status: 'used', used_on: usedOn, updated_at: new Date().toISOString() })
        .eq('id', creditId)

      if (!error) await refetch()
      return { error }
    },
    [refetch],
  )

  const reopenCredit = useCallback(
    async (creditId: string) => {
      const { error } = await supabase
        .from('holiday_credits')
        .update({ status: 'owed', used_on: null, updated_at: new Date().toISOString() })
        .eq('id', creditId)

      if (!error) await refetch()
      return { error }
    },
    [refetch],
  )

  return {
    holidays,
    balances,
    credits,
    isLoading,
    refetch,
    setCompanyClosed,
    syncCredits,
    markCreditUsed,
    reopenCredit,
  }
}
