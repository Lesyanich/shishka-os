import { describe, it, expect } from 'vitest'
import {
  thb,
  thbPdf,
  periodLabel,
  periodSlug,
  formatDate,
  safeName,
  derivePayslip,
  COMPANY_NAME,
} from './payslip-helpers'
import type { PayslipData } from '../../hooks/use-payroll'

function makeData(
  overrides?: Partial<PayslipData['line']>,
  staffOverrides?: Partial<PayslipData['staff']>,
): PayslipData {
  return {
    line: {
      id: 'l1',
      payroll_period_id: 'p1',
      staff_id: 's1',
      days_worked: 29,
      days_absent: 2,
      days_leave_paid: 0,
      base_salary: 15000,
      overtime_pay: 0,
      absence_deduction: 968,
      sso_employee: 0,
      sso_employer: 0,
      withholding_tax: 0,
      other_deductions: 0,
      net_pay: 14032,
      expense_ledger_id: 'e1',
      notes: null,
      ...overrides,
    },
    staff: {
      id: 's1',
      name: 'Alex',
      name_th: null,
      role: 'cook',
      nationality: 'myanmar',
      hire_date: '2026-02-18',
      employment_type: 'full_time',
      sso_number: null,
      monthly_salary: 15000,
      work_permit_annual_thb: null,
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
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
    },
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

  it('derivePayslip rolls up gross/deductions/net from stored values', () => {
    const d = derivePayslip(makeData())
    expect(d.gross).toBe(15000) // base + OT(0)
    expect(d.totalDeductions).toBe(968) // absence + sso(0) + wht(0) + other(0)
    expect(d.net).toBe(14032) // stored net_pay, not recomputed
    expect(d.calendarDays).toBe(31) // May
  })

  it('derivePayslip includes overtime and SSO when present', () => {
    const d = derivePayslip(
      makeData({ overtime_pay: 500, sso_employee: 750, net_pay: 14782 }),
    )
    expect(d.gross).toBe(15500)
    expect(d.totalDeductions).toBe(968 + 750)
    expect(d.net).toBe(14782) // stays the stored value
  })

  it('derivePayslip surfaces employer-paid benefits without touching net', () => {
    // Unenrolled, no work permit set → nothing to show.
    const none = derivePayslip(makeData())
    expect(none.hasEmployerPaid).toBe(false)
    expect(none.workPermitAnnual).toBe(0)
    expect(none.employerSso).toBe(0)

    // Work permit set + enrolled (employer SSO match) → both shown, net unchanged.
    const d = derivePayslip(
      makeData({ sso_employer: 750 }, { work_permit_annual_thb: 15000 }),
    )
    expect(d.workPermitAnnual).toBe(15000)
    expect(d.employerSso).toBe(750)
    expect(d.hasEmployerPaid).toBe(true)
    expect(d.net).toBe(14032) // employer-paid items never alter net
    expect(d.totalDeductions).toBe(968) // not counted as a deduction
  })

  it('exposes company name', () => {
    expect(COMPANY_NAME).toMatch(/Shishka/)
  })
})
