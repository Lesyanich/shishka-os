import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface UnworkedTimeAdjustment {
  id: string
  staff_id: string
  period_month: string
  late_minutes: number
  amount: number
  note: string | null
  approved_by: string | null
  approved_at: string
}

export interface UseUnworkedTimeResult {
  adjustments: UnworkedTimeAdjustment[]
  isSaving: boolean
  error: string | null
  /** Approve the month's unworked minutes → payslip line "hours not worked". */
  approve: (args: {
    staffId: string
    periodMonth: string
    lateMinutes: number
    amount: number
    note?: string
  }) => Promise<boolean>
  /** Take it back off the payslip. */
  revoke: (id: string) => Promise<boolean>
  refetch: () => void
}

/**
 * Owner-approved value of late minutes (`unworked_time_adjustments`, mig 372).
 *
 * Approving writes the amount into the month's payroll line
 * (`payroll_lines.other_deductions`) the next time payroll is calculated —
 * nothing is deducted without a row here, and nothing writes a row but an
 * owner. Excused minutes never reach this screen (LEG-004 §3).
 */
export function useUnworkedTime(approvedBy: string | null): UseUnworkedTimeResult {
  const [adjustments, setAdjustments] = useState<UnworkedTimeAdjustment[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAdjustments = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('unworked_time_adjustments')
      .select('id, staff_id, period_month, late_minutes, amount, note, approved_by, approved_at')

    if (fetchError) {
      console.error('[useUnworkedTime] fetch error', fetchError)
      setError(fetchError.message)
      return
    }
    setAdjustments((data ?? []) as UnworkedTimeAdjustment[])
  }, [])

  useEffect(() => {
    fetchAdjustments()
  }, [fetchAdjustments])

  const approve = useCallback<UseUnworkedTimeResult['approve']>(
    async ({ staffId, periodMonth, lateMinutes, amount, note }) => {
      setIsSaving(true)
      setError(null)
      const { error: upsertError } = await supabase.from('unworked_time_adjustments').upsert(
        {
          staff_id: staffId,
          period_month: periodMonth,
          late_minutes: lateMinutes,
          amount: Number(amount.toFixed(2)),
          note: note ?? null,
          approved_by: approvedBy,
        },
        { onConflict: 'staff_id,period_month' },
      )
      setIsSaving(false)
      if (upsertError) {
        console.error('[useUnworkedTime] approve error', upsertError)
        setError(upsertError.message)
        return false
      }
      await fetchAdjustments()
      return true
    },
    [approvedBy, fetchAdjustments],
  )

  const revoke = useCallback(
    async (id: string): Promise<boolean> => {
      setIsSaving(true)
      setError(null)
      const { error: deleteError } = await supabase
        .from('unworked_time_adjustments')
        .delete()
        .eq('id', id)
      setIsSaving(false)
      if (deleteError) {
        console.error('[useUnworkedTime] revoke error', deleteError)
        setError(deleteError.message)
        return false
      }
      await fetchAdjustments()
      return true
    },
    [fetchAdjustments],
  )

  return { adjustments, isSaving, error, approve, revoke, refetch: fetchAdjustments }
}
