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
  base_salary: number
  overtime_pay: number
  absence_deduction: number
  sso_employee: number
  sso_employer: number
  withholding_tax: number
  other_deductions: number
  net_pay: number
  expense_ledger_id: string | null
  notes: string | null
}

/** Staff detail needed to render a formal payslip header. */
export interface PayslipStaff {
  id: string
  name: string
  name_th: string | null
  role: string
  nationality: string | null
  hire_date: string | null
  employment_type: string | null
  sso_number: string | null
  monthly_salary: number | null
  /** Employer-paid annual work permit + visa cost (THB). Informational, never deducted. */
  work_permit_annual_thb: number | null
}

/** A full payslip = one payroll_lines row + its staff + its period. */
export interface PayslipData {
  line: PayrollLine
  staff: PayslipStaff
  period: PayrollPeriod
}

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

  const getLines = useCallback(async (periodId: string): Promise<PayrollLine[]> => {
    const { data } = await supabase
      .from('payroll_lines')
      .select('*, staff:staff_id(name)')
      .eq('payroll_period_id', periodId)

    if (!data) return []

    return data.map((row: Record<string, unknown>) => ({
      ...(row as unknown as PayrollLine),
      staff_name: (row.staff as { name: string } | null)?.name ?? '—',
    }))
  }, [])

  const getPayslip = useCallback(
    async (periodId: string, staffId: string): Promise<PayslipData | null> => {
      const [lineRes, staffRes, periodRes] = await Promise.all([
        supabase
          .from('payroll_lines')
          .select('*')
          .eq('payroll_period_id', periodId)
          .eq('staff_id', staffId)
          .maybeSingle(),
        supabase
          .from('staff')
          .select(
            'id, name, name_th, role, nationality, hire_date, employment_type, sso_number, monthly_salary, work_permit_annual_thb',
          )
          .eq('id', staffId)
          .maybeSingle(),
        supabase
          .from('payroll_periods')
          .select('*')
          .eq('id', periodId)
          .maybeSingle(),
      ])

      if (!lineRes.data || !staffRes.data || !periodRes.data) return null

      return {
        line: lineRes.data as unknown as PayrollLine,
        staff: staffRes.data as unknown as PayslipStaff,
        period: periodRes.data as unknown as PayrollPeriod,
      }
    },
    [],
  )

  return {
    periods,
    isLoading,
    createPeriod,
    calculatePayroll,
    approvePayroll,
    getLines,
    getPayslip,
  }
}
