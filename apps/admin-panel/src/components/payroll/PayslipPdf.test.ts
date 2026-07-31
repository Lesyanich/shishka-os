import { describe, it, expect } from 'vitest'
import { PayslipPdf } from './PayslipPdf'
import type { PayslipData } from '../../hooks/use-payroll'

function makeData(): PayslipData {
  return {
    line: {
      id: 'l1',
      payroll_period_id: 'p1',
      staff_id: 's1',
      days_worked: 26,
      days_absent: 0,
      days_leave_paid: 0,
      late_days: 0,
      late_minutes: 0,
      late_deduction: 0,
      base_salary: 15000,
      overtime_pay: 0,
      bonus_pay: 0,
      bonus_note: null,
      absence_deduction: 0,
      sso_employee: 0,
      sso_employer: 0,
      withholding_tax: 0,
      other_deductions: 0,
      net_pay: 15000,
      is_manual_override: false,
      expense_ledger_id: 'e1',
      notes: null,
    },
    staff: {
      id: 's1',
      name: 'Hein',
      name_th: null,
      legal_name_first: null,
      legal_name_last: null,
      role: 'cook',
      nationality: 'myanmar',
      date_of_birth: null,
      address: null,
      hire_date: '2026-02-18',
      employment_type: 'full_time',
      sso_number: null,
      sso_enrolled_from: null,
      tax_id: null,
      work_permit_number: null,
      work_permit_expiry: null,
      monthly_salary: 15000,
    },
    period: {
      id: 'p1',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      status: 'paid',
      approved_by: null,
      approved_at: null,
      paid_at: null,
      notes: null,
      punctuality_reviewed_at: null,
      punctuality_reviewed_by: null,
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
    },
    payments: [],
    advancesPaid: 0,
  }
}

// PayslipPdf is a pure @react-pdf/renderer document — no Supabase/browser deps.
// Smoke test: it constructs a React element from stored payslip data.
describe('PayslipPdf', () => {
  it('is a component function', () => {
    expect(typeof PayslipPdf).toBe('function')
  })

  it('returns a React element from payslip data', () => {
    const el = PayslipPdf({ data: makeData() })
    expect(el).toBeTruthy()
    expect(el).toHaveProperty('type')
  })

  it('renders with advances recorded against the period', () => {
    const data = makeData()
    data.payments = [
      {
        id: 'pay1',
        staff_id: 's1',
        payroll_period_id: 'p1',
        paid_on: '2026-05-15',
        amount: 6000,
        kind: 'advance',
        payment_method: 'cash',
        note: 'requested advance',
        expense_ledger_id: null,
        created_at: '2026-05-15T00:00:00Z',
      },
    ]
    data.advancesPaid = 6000
    const el = PayslipPdf({ data })
    expect(el).toBeTruthy()
  })
})
