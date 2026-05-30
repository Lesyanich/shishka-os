import { describe, it, expect } from 'vitest'
import { PayslipPdf } from './PayslipPdf'

// PayslipPdf is a pure @react-pdf/renderer document — no Supabase/browser deps.
// Smoke test: it constructs a React element from stored payslip data.
describe('PayslipPdf', () => {
  it('is a component function', () => {
    expect(typeof PayslipPdf).toBe('function')
  })

  it('returns a React element from payslip data', () => {
    const el = PayslipPdf({
      data: {
        line: {
          id: 'l1',
          payroll_period_id: 'p1',
          staff_id: 's1',
          days_worked: 31,
          days_absent: 0,
          days_leave_paid: 0,
          base_salary: 15000,
          overtime_pay: 0,
          absence_deduction: 0,
          sso_employee: 0,
          sso_employer: 0,
          withholding_tax: 0,
          other_deductions: 0,
          net_pay: 15000,
          expense_ledger_id: 'e1',
          notes: null,
        },
        staff: {
          id: 's1',
          name: 'Hein',
          name_th: null,
          role: 'cook',
          nationality: 'myanmar',
          hire_date: '2026-02-18',
          employment_type: 'full_time',
          sso_number: null,
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
          created_at: '2026-05-30T00:00:00Z',
          updated_at: '2026-05-30T00:00:00Z',
        },
      },
    })
    expect(el).toBeTruthy()
    expect(el).toHaveProperty('type')
  })
})
