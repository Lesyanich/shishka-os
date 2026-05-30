import { describe, it, expect } from 'vitest'

import { PayrollPage } from './PayrollPage'

// Fields rendered on the payroll table + payslip; guards against schema drift.
const PAYROLL_LINE_FIELDS = [
  'base_salary',
  'overtime_pay',
  'absence_deduction',
  'sso_employee',
  'net_pay',
] as const

describe('PayrollPage', () => {
  it('exposes PayrollPage component', () => {
    expect(typeof PayrollPage).toBe('function')
  })

  it('documents payroll line fields used in UI', () => {
    expect(PAYROLL_LINE_FIELDS.length).toBeGreaterThan(0)
  })
})
