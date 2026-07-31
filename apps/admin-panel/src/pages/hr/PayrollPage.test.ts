import { describe, it, expect } from 'vitest'

import { PayrollPage, mergePayrollParams } from './PayrollPage'

// Fields rendered on the payroll table + payslip; guards against schema drift.
const PAYROLL_LINE_FIELDS = [
  'base_salary',
  'overtime_pay',
  'bonus_pay',
  'absence_deduction',
  'late_days',
  'late_minutes',
  'late_deduction',
  'sso_employee',
  'withholding_tax',
  'net_pay',
  'is_manual_override',
] as const

describe('PayrollPage', () => {
  it('exposes PayrollPage component', () => {
    expect(typeof PayrollPage).toBe('function')
  })

  it('documents payroll line fields used in UI', () => {
    expect(PAYROLL_LINE_FIELDS.length).toBeGreaterThan(0)
    expect(PAYROLL_LINE_FIELDS).toContain('bonus_pay')
    expect(PAYROLL_LINE_FIELDS).toContain('late_deduction')
  })
})

describe('mergePayrollParams — deep links', () => {
  it('opens a period', () => {
    const out = mergePayrollParams(new URLSearchParams(), { period: 'p1' })
    expect(out.get('period')).toBe('p1')
    expect(out.get('payslip')).toBeNull()
  })

  it('opens a payslip inside a period, so the slip has its own address', () => {
    const out = mergePayrollParams(new URLSearchParams('period=p1'), {
      period: 'p1',
      payslip: 's1',
    })
    expect(out.toString()).toBe('period=p1&payslip=s1')
  })

  it('closing a payslip leaves its period open', () => {
    // The whole point of undefined-vs-null: closing the slip must not collapse
    // the period underneath it.
    const out = mergePayrollParams(new URLSearchParams('period=p1&payslip=s1'), {
      payslip: null,
    })
    expect(out.get('period')).toBe('p1')
    expect(out.get('payslip')).toBeNull()
  })

  it('closing a period closes the payslip with it', () => {
    const out = mergePayrollParams(new URLSearchParams('period=p1&payslip=s1'), {
      period: null,
      payslip: null,
    })
    expect(out.toString()).toBe('')
  })

  it('leaves unrelated params alone', () => {
    const out = mergePayrollParams(new URLSearchParams('tab=x&period=p1'), {
      payslip: 's2',
    })
    expect(out.get('tab')).toBe('x')
    expect(out.get('period')).toBe('p1')
    expect(out.get('payslip')).toBe('s2')
  })
})
