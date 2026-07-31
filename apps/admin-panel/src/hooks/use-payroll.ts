import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface PayrollPeriod {
  id: string
  period_start: string
  period_end: string
  status: 'draft' | 'calculated' | 'approved' | 'paid'
  approved_by: string | null
  approved_at: string | null
  paid_at: string | null
  notes: string | null
  /** Set when the owner has reviewed every unexcused late. Approval is blocked until then. */
  punctuality_reviewed_at: string | null
  punctuality_reviewed_by: string | null
  created_at: string
  updated_at: string
}

export interface PayrollLine {
  id: string
  payroll_period_id: string
  staff_id: string
  staff_name?: string
  days_worked: number
  days_absent: number
  days_leave_paid: number
  /** Days with a credible unexcused late arrival. Shown even when nothing is deducted. */
  late_days: number
  late_minutes: number
  /** Value of unworked late minutes. Zero unless all three LEG-004 gates pass. */
  late_deduction: number
  base_salary: number
  overtime_pay: number
  bonus_pay: number
  bonus_note: string | null
  absence_deduction: number
  sso_employee: number
  sso_employer: number
  withholding_tax: number
  other_deductions: number
  net_pay: number
  /** When true the line is frozen — fn_calculate_payroll skips it entirely. */
  is_manual_override: boolean
  expense_ledger_id: string | null
  notes: string | null
  /** Joined in by getLines: advances already paid against this period. */
  advances_paid?: number
}

/** A single cash-out event against a period. */
export interface StaffPayment {
  id: string
  staff_id: string
  payroll_period_id: string
  paid_on: string
  amount: number
  kind: 'advance' | 'final' | 'correction'
  payment_method: string
  note: string | null
  expense_ledger_id: string | null
  created_at: string
}

/** Staff detail needed to render a formal payslip header. */
export interface PayslipStaff {
  id: string
  name: string
  name_th: string | null
  legal_name_first: string | null
  legal_name_last: string | null
  role: string
  nationality: string | null
  date_of_birth: string | null
  address: string | null
  hire_date: string | null
  employment_type: string | null
  sso_number: string | null
  sso_enrolled_from: string | null
  tax_id: string | null
  work_permit_number: string | null
  work_permit_expiry: string | null
  monthly_salary: number | null
}

/** A full payslip = one payroll_lines row + its staff + its period + payments made. */
export interface PayslipData {
  line: PayrollLine
  staff: PayslipStaff
  period: PayrollPeriod
  payments: StaffPayment[]
  advancesPaid: number
  /** Substitute days off still owed for public holidays worked (LPA §29). */
  substituteDaysOwed: number
}

const STAFF_PAYSLIP_COLUMNS =
  'id, name, name_th, legal_name_first, legal_name_last, role, nationality, ' +
  'date_of_birth, address, hire_date, employment_type, sso_number, ' +
  'sso_enrolled_from, tax_id, work_permit_number, work_permit_expiry, monthly_salary'

export function usePayroll() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchPeriods = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supabase
      .from('payroll_periods')
      .select('*')
      .order('period_start', { ascending: false })

    if (data) setPeriods(data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchPeriods()
  }, [fetchPeriods])

  const createPeriod = useCallback(
    async (start: string, end: string) => {
      const { error } = await supabase
        .from('payroll_periods')
        .insert({ period_start: start, period_end: end })

      if (!error) await fetchPeriods()
      return { error }
    },
    [fetchPeriods],
  )

  const calculatePayroll = useCallback(
    async (periodId: string) => {
      const { error } = await supabase.rpc('fn_calculate_payroll', {
        p_period_id: periodId,
      })

      if (!error) await fetchPeriods()
      return { error }
    },
    [fetchPeriods],
  )

  /**
   * Recalculation only runs on a draft period, so re-opening a calculated one
   * is a legitimate step — not a workaround. Owner-entered bonuses, notes and
   * frozen lines all survive it (migration 396).
   */
  const reopenPeriod = useCallback(
    async (periodId: string) => {
      const { error } = await supabase
        .from('payroll_periods')
        .update({ status: 'draft' })
        .eq('id', periodId)

      if (!error) await fetchPeriods()
      return { error }
    },
    [fetchPeriods],
  )

  const approvePayroll = useCallback(
    async (periodId: string) => {
      const { error } = await supabase.rpc('fn_approve_payroll', {
        p_period_id: periodId,
      })

      if (!error) await fetchPeriods()
      return { error }
    },
    [fetchPeriods],
  )

  /** Mark lateness reviewed for the period — the gate fn_approve_payroll checks. */
  const markPunctualityReviewed = useCallback(
    async (periodId: string, by: string) => {
      const { error } = await supabase
        .from('payroll_periods')
        .update({
          punctuality_reviewed_at: new Date().toISOString(),
          punctuality_reviewed_by: by,
        })
        .eq('id', periodId)

      if (!error) await fetchPeriods()
      return { error }
    },
    [fetchPeriods],
  )

  const getLines = useCallback(async (periodId: string): Promise<PayrollLine[]> => {
    const [linesRes, paymentsRes] = await Promise.all([
      supabase
        .from('payroll_lines')
        .select('*, staff:staff_id(name)')
        .eq('payroll_period_id', periodId),
      supabase
        .from('staff_payments')
        .select('staff_id, amount')
        .eq('payroll_period_id', periodId),
    ])

    if (!linesRes.data) return []

    const advancesByStaff = new Map<string, number>()
    for (const p of (paymentsRes.data ?? []) as { staff_id: string; amount: number }[]) {
      advancesByStaff.set(p.staff_id, (advancesByStaff.get(p.staff_id) ?? 0) + p.amount)
    }

    return linesRes.data.map((row: Record<string, unknown>) => ({
      ...(row as unknown as PayrollLine),
      staff_name: (row.staff as { name: string } | null)?.name ?? '—',
      advances_paid: advancesByStaff.get(row.staff_id as string) ?? 0,
    }))
  }, [])

  /**
   * Set (or clear) a discretionary bonus and reconcile net_pay in the same
   * write. net_pay is stored, not derived, so it has to move with the bonus —
   * and fn_calculate_payroll deliberately never touches bonus_pay, so this is
   * the only writer.
   */
  const setBonus = useCallback(
    async (line: PayrollLine, amount: number, note: string) => {
      const net =
        line.base_salary +
        line.overtime_pay +
        amount -
        line.absence_deduction -
        line.other_deductions -
        line.sso_employee -
        line.withholding_tax

      const { error } = await supabase
        .from('payroll_lines')
        .update({
          bonus_pay: amount,
          bonus_note: note.trim() === '' ? null : note.trim(),
          net_pay: net,
        })
        .eq('id', line.id)

      return { error }
    },
    [],
  )

  /**
   * Freeze or unfreeze a line. Freezing at a chosen net is how a CEO decision
   * that overrides the arithmetic survives every future recalculation.
   */
  const setManualOverride = useCallback(
    async (lineId: string, frozen: boolean, netPay: number, reason: string) => {
      const { error } = await supabase
        .from('payroll_lines')
        .update({
          is_manual_override: frozen,
          net_pay: netPay,
          notes: reason.trim() === '' ? null : reason.trim(),
        })
        .eq('id', lineId)

      return { error }
    },
    [],
  )

  const getPayments = useCallback(
    async (periodId: string, staffId: string): Promise<StaffPayment[]> => {
      const { data } = await supabase
        .from('staff_payments')
        .select('*')
        .eq('payroll_period_id', periodId)
        .eq('staff_id', staffId)
        .order('paid_on')

      return (data ?? []) as StaffPayment[]
    },
    [],
  )

  /**
   * Record an advance. The guard is not decoration: an advance beyond what the
   * employee has actually earned stops being a wage advance and becomes a debt,
   * and recovering a debt from later wages runs into LPA §76. The DB refuses it
   * again at approval time.
   */
  const addPayment = useCallback(
    async (
      line: PayrollLine,
      paidOn: string,
      amount: number,
      kind: StaffPayment['kind'],
      note: string,
    ) => {
      const alreadyPaid = line.advances_paid ?? 0
      if (amount + alreadyPaid > line.net_pay) {
        return {
          error: {
            message:
              `Advance of ${amount} would take total payments to ${amount + alreadyPaid}, ` +
              `above the ${line.net_pay} earned this period. An advance may not exceed ` +
              `the wage accrued to date.`,
          },
        }
      }

      const { error } = await supabase.from('staff_payments').insert({
        staff_id: line.staff_id,
        payroll_period_id: line.payroll_period_id,
        paid_on: paidOn,
        amount,
        kind,
        note: note.trim() === '' ? null : note.trim(),
      })

      return { error }
    },
    [],
  )

  const deletePayment = useCallback(async (paymentId: string) => {
    const { error } = await supabase.from('staff_payments').delete().eq('id', paymentId)
    return { error }
  }, [])

  const getPayslip = useCallback(
    async (periodId: string, staffId: string): Promise<PayslipData | null> => {
      const [lineRes, staffRes, periodRes, paymentsRes, creditsRes] = await Promise.all([
        supabase
          .from('payroll_lines')
          .select('*')
          .eq('payroll_period_id', periodId)
          .eq('staff_id', staffId)
          .maybeSingle(),
        supabase
          .from('staff')
          .select(STAFF_PAYSLIP_COLUMNS)
          .eq('id', staffId)
          .maybeSingle(),
        supabase
          .from('payroll_periods')
          .select('*')
          .eq('id', periodId)
          .maybeSingle(),
        supabase
          .from('staff_payments')
          .select('*')
          .eq('payroll_period_id', periodId)
          .eq('staff_id', staffId)
          .order('paid_on'),
        // A running balance, not a per-period figure — it is what the person is
        // still owed for holidays worked, whenever they were worked.
        supabase
          .from('holiday_credits')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', staffId)
          .eq('status', 'owed'),
      ])

      if (!lineRes.data || !staffRes.data || !periodRes.data) return null

      const payments = (paymentsRes.data ?? []) as StaffPayment[]

      return {
        line: lineRes.data as unknown as PayrollLine,
        staff: staffRes.data as unknown as PayslipStaff,
        period: periodRes.data as unknown as PayrollPeriod,
        payments,
        advancesPaid: payments.reduce((s, p) => s + p.amount, 0),
        substituteDaysOwed: creditsRes.count ?? 0,
      }
    },
    [],
  )

  return {
    periods,
    isLoading,
    createPeriod,
    calculatePayroll,
    reopenPeriod,
    approvePayroll,
    markPunctualityReviewed,
    getLines,
    setBonus,
    setManualOverride,
    getPayments,
    addPayment,
    deletePayment,
    getPayslip,
  }
}
