import { describe, it, expect } from 'vitest'
import {
  thb,
  thbPdf,
  periodLabel,
  periodSlug,
  formatDate,
  safeName,
  legalName,
  isCallNameOnly,
  orMissing,
  derivePayslip,
  COMPANY_NAME,
} from './payslip-helpers'
import type { PayslipData, StaffPayment } from '../../hooks/use-payroll'

function makeData(
  overrides?: Partial<PayslipData['line']>,
  staffOverrides?: Partial<PayslipData['staff']>,
  payments: StaffPayment[] = [],
): PayslipData {
  return {
    line: {
      id: 'l1',
      payroll_period_id: 'p1',
      staff_id: 's1',
      days_worked: 29,
      days_absent: 2,
      days_leave_paid: 0,
      late_days: 0,
      late_minutes: 0,
      late_deduction: 0,
      base_salary: 15000,
      overtime_pay: 0,
      bonus_pay: 0,
      bonus_note: null,
      absence_deduction: 968,
      sso_employee: 0,
      sso_employer: 0,
      withholding_tax: 0,
      other_deductions: 0,
      net_pay: 14032,
      is_manual_override: false,
      expense_ledger_id: 'e1',
      notes: null,
      ...overrides,
    },
    staff: {
      id: 's1',
      name: 'Alex',
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
      ...staffOverrides,
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
    payments,
    advancesPaid: payments.reduce((s, p) => s + p.amount, 0),
    substituteDaysOwed: 0,
  }
}

describe('payslip-helpers', () => {
  it('thb formats with baht sign, thousands, no decimals', () => {
    expect(thb(14032)).toBe('฿14,032')
    expect(thb(0)).toBe('฿0')
    expect(thb(6580.65)).toBe('฿6,581')
  })

  it('thbPdf formats with THB code (no ฿ glyph) for PDF rendering', () => {
    expect(thbPdf(14032)).toBe('THB 14,032')
    expect(thbPdf(0)).toBe('THB 0')
    expect(thbPdf(6580.65)).toBe('THB 6,581')
    expect(thbPdf(14032)).not.toContain('฿')
  })

  it('periodLabel renders month + year', () => {
    expect(periodLabel('2026-05-01')).toBe('May 2026')
  })

  it('periodSlug returns YYYY-MM', () => {
    expect(periodSlug('2026-05-01')).toBe('2026-05')
  })

  it('formatDate handles null', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('2026-02-18')).toContain('2026')
  })

  it('safeName strips unsafe filename chars', () => {
    expect(safeName('Noe Noe Zin')).toBe('Noe_Noe_Zin')
    expect(safeName('Алекс/PDF')).toBe('_PDF')
  })

  it('legalName prefers the legal fields and falls back to the call-name', () => {
    const callOnly = makeData().staff
    expect(legalName(callOnly)).toBe('Alex')
    expect(isCallNameOnly(callOnly)).toBe(true)

    const legal = makeData(undefined, {
      legal_name_first: 'Aung',
      legal_name_last: 'Ko Ko',
    }).staff
    expect(legalName(legal)).toBe('Aung Ko Ko')
    expect(isCallNameOnly(legal)).toBe(false)
  })

  it('orMissing surfaces uncollected statutory fields rather than hiding them', () => {
    expect(orMissing(null)).toBe('Not on file')
    expect(orMissing('')).toBe('Not on file')
    expect(orMissing('0835565012247')).toBe('0835565012247')
  })

  it('derivePayslip rolls up gross/deductions/net from stored values', () => {
    const d = derivePayslip(makeData())
    expect(d.gross).toBe(15000) // base + OT(0) + bonus(0)
    expect(d.totalDeductions).toBe(968) // absence + other(0) + sso(0) + wht(0)
    expect(d.net).toBe(14032) // stored net_pay, not recomputed
    expect(d.calendarDays).toBe(31) // May
  })

  it('derivePayslip counts a bonus into gross', () => {
    const d = derivePayslip(makeData({ bonus_pay: 1200, net_pay: 15232 }))
    expect(d.gross).toBe(16200)
    expect(d.net).toBe(15232)
  })

  it('derivePayslip counts the late deduction once, via other_deductions', () => {
    // fn_calculate_payroll routes the late deduction through other_deductions,
    // so summing both would double-count it.
    const d = derivePayslip(
      makeData({ late_days: 2, late_minutes: 45, late_deduction: 47, other_deductions: 47 }),
    )
    expect(d.totalDeductions).toBe(968 + 47)
    expect(d.otherBeyondLate).toBe(0)
    expect(d.hasLateness).toBe(true)
  })

  it('derivePayslip splits out any other deduction beyond lateness', () => {
    const d = derivePayslip(
      makeData({ late_deduction: 47, other_deductions: 147 }),
    )
    expect(d.totalDeductions).toBe(968 + 147)
    expect(d.otherBeyondLate).toBe(100)
  })

  it('derivePayslip treats advances as payments against net, never as deductions', () => {
    const d = derivePayslip(
      makeData(undefined, undefined, [
        {
          id: 'pay1',
          staff_id: 's1',
          payroll_period_id: 'p1',
          paid_on: '2026-05-15',
          amount: 6000,
          kind: 'advance',
          payment_method: 'cash',
          note: null,
          expense_ledger_id: null,
          created_at: '2026-05-15T00:00:00Z',
        },
      ]),
    )
    expect(d.advancesPaid).toBe(6000)
    expect(d.balanceDue).toBe(14032 - 6000)
    expect(d.totalDeductions).toBe(968) // advance is NOT a deduction
    expect(d.net).toBe(14032) // entitlement unchanged
  })

  it('surfaces the employer SSO match without touching net', () => {
    const none = derivePayslip(makeData())
    expect(none.hasEmployerPaid).toBe(false)
    expect(none.employerSso).toBe(0)

    const d = derivePayslip(makeData({ sso_employer: 750 }))
    expect(d.employerSso).toBe(750)
    expect(d.hasEmployerPaid).toBe(true)
    expect(d.net).toBe(14032) // employer-paid items never alter net
    expect(d.totalDeductions).toBe(968) // not counted as a deduction
  })

  it('never exposes a work-permit figure — it is an HR cost, not part of the wage', () => {
    const d = derivePayslip(makeData())
    expect(d).not.toHaveProperty('workPermitAnnual')
  })

  it('exposes company name', () => {
    expect(COMPANY_NAME).toMatch(/Shishka/)
  })
})
