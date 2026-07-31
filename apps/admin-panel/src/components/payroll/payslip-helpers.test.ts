import { describe, it, expect } from 'vitest'
import {
  thb,
  thbPdf,
  signedThb,
  signedThbPdf,
  periodLabel,
  periodSlug,
  formatDate,
  safeName,
  legalName,
  isCallNameOnly,
  orMissing,
  derivePayslip,
  buildPayslipStatement,
  statementReconciles,
  COMPANY_NAME,
  COMPANY_TAX_ID,
  COMPANY_ADDRESS,
  COMPANY_SSO_ACCOUNT,
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

describe('signed money — the sign is printed, never inferred (CEO rule 3)', () => {
  it('prints + and − on screen, and zero unsigned', () => {
    expect(signedThb(800)).toBe('+฿800')
    expect(signedThb(-600)).toBe('−฿600')
    expect(signedThb(0)).toBe('฿0')
  })

  it('uses an ASCII hyphen in the PDF — Helvetica is WinAnsi and has no U+2212', () => {
    expect(signedThbPdf(-600)).toBe('-THB 600')
    expect(signedThbPdf(800)).toBe('+THB 800')
    expect(signedThbPdf(-600)).not.toContain('−')
    expect(signedThbPdf(-600)).not.toContain('฿')
  })
})

/**
 * Noe Noe's real July 2026 line — the worked example the CEO signed off on
 * (MC b4876c65). If the layout ever stops producing 11,400 and 9,400 from
 * these inputs, the slip has started disagreeing with what was actually paid.
 */
function noeNoeJuly() {
  return makeData(
    {
      base_salary: 12000,
      overtime_pay: 0,
      bonus_pay: 800,
      bonus_note: 'Discretionary bonus — the employer covers the two deducted days.',
      absence_deduction: 800,
      days_worked: 24,
      days_absent: 2,
      days_leave_paid: 1,
      sso_employee: 600,
      sso_employer: 600,
      withholding_tax: 0,
      net_pay: 11400,
    },
    { name: 'Noe Noe', monthly_salary: 12000 },
    [
      {
        id: 'adv1',
        staff_id: 's1',
        payroll_period_id: 'p1',
        paid_on: '2026-07-17',
        amount: 2000,
        kind: 'advance',
        payment_method: 'cash',
        note: null,
        expense_ledger_id: null,
        created_at: '2026-07-17T00:00:00Z',
      },
    ],
  )
}

describe('buildPayslipStatement — the CEO layout, 2026-07-31 (MC b4876c65)', () => {
  it('never prints a GROSS subtotal', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    expect(st.rows.map((r) => r.key)).not.toContain('gross')
    expect(st.rows.map((r) => r.label.toLowerCase())).not.toContain('gross')
  })

  it('keeps the wage base available for the register even though it is not printed', () => {
    // Not decoration: gross is what gets filed on สปส.1-10, and the filed
    // figure and the held figure must be the same number.
    expect(derivePayslip(noeNoeJuly()).gross).toBe(12800)
  })

  it('puts the bonus last, after the deductions', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    expect(st.rows[st.rows.length - 1].key).toBe('bonus')
  })

  it('orders the column base → overtime → deductions → bonus', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    expect(st.rows.map((r) => r.key)).toEqual([
      'base',
      'overtime',
      'absence',
      'sso',
      'wht',
      'bonus',
    ])
  })

  it('reconciles: the printed column adds up to the printed total', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    // 12,000 + 0 − 800 − 600 + 800 = 11,400
    expect(st.rows.reduce((s, r) => s + r.amount, 0)).toBe(11400)
    expect(st.total).toBe(11400)
    expect(statementReconciles(st)).toBe(true)
  })

  it('carries deductions as negative amounts and earnings as positive', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    const by = Object.fromEntries(st.rows.map((r) => [r.key, r.amount]))
    expect(by.base).toBe(12000)
    expect(by.bonus).toBe(800)
    expect(by.absence).toBe(-800)
    expect(by.sso).toBe(-600)
  })

  it('settles advances below the total, never as a deduction', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    expect(st.rows.some((r) => r.key === 'adv1')).toBe(false)
    expect(st.settlements).toHaveLength(1)
    expect(st.settlements[0].amount).toBe(-2000)
    expect(st.paidToday).toBe(9400)
    expect(st.hasSettlements).toBe(true)
  })

  it('shows the month total only when something was already handed over', () => {
    // With no advance, "total for the month" and "paid today" are the same
    // figure — printing both would just repeat it.
    const st = buildPayslipStatement(makeData({ net_pay: 14250 }))
    expect(st.hasSettlements).toBe(false)
    expect(st.paidToday).toBe(14250)
  })

  it('keeps a zero that answers a question, and drops one that does not', () => {
    const st = buildPayslipStatement(makeData({ overtime_pay: 0, bonus_pay: 0 }))
    const overtime = st.rows.find((r) => r.key === 'overtime')
    expect(overtime?.amount).toBe(0)
    expect(overtime?.dim).toBe(true)
    expect(overtime?.sub).toBe('none worked')
    // An unexplained zero bonus answers nothing — it is not printed at all.
    expect(st.rows.some((r) => r.key === 'bonus')).toBe(false)
  })

  it('mentions lateness only when there was lateness', () => {
    expect(
      buildPayslipStatement(makeData()).rows.some((r) => r.key === 'late'),
    ).toBe(false)

    // Recorded but not deducted — LEG-004 gates unmet. Shown, quietly, at zero:
    // the record exists and the employee is entitled to see it was not charged.
    const withLate = buildPayslipStatement(
      makeData({ late_days: 1, late_minutes: 12, late_deduction: 0 }),
    )
    const late = withLate.rows.find((r) => r.key === 'late')
    expect(late?.amount).toBe(0)
    expect(late?.sub).toContain('not deducted')
  })

  it('spells out the absence basis so the employee can check it', () => {
    const st = buildPayslipStatement(noeNoeJuly())
    expect(st.rows.find((r) => r.key === 'absence')?.sub).toContain('2 day(s)')
    expect(st.rows.find((r) => r.key === 'absence')?.sub).toContain('§68')
  })

  it('the PDF variant stays inside WinAnsi — no §, no ฿', () => {
    const st = buildPayslipStatement(noeNoeJuly(), { pdf: true })
    const text = st.rows
      .map((r) => `${r.label} ${r.sub ?? ''}`)
      .concat(st.settlements.map((s) => s.label))
      .join(' ')
    expect(text).not.toContain('§')
    expect(text).not.toContain('฿')
    expect(text).toContain('LPA s.68')
  })

  it('screen and PDF agree on every figure — only the wording differs', () => {
    const screen = buildPayslipStatement(noeNoeJuly())
    const pdfSt = buildPayslipStatement(noeNoeJuly(), { pdf: true })
    expect(pdfSt.rows.map((r) => r.amount)).toEqual(screen.rows.map((r) => r.amount))
    expect(pdfSt.total).toBe(screen.total)
    expect(pdfSt.paidToday).toBe(screen.paidToday)
  })

  it("Hein's July: a substitute day consumes the absence, so nothing is deducted", () => {
    const st = buildPayslipStatement(
      makeData(
        {
          base_salary: 15000,
          absence_deduction: 0,
          days_worked: 26,
          days_absent: 0,
          days_leave_paid: 1,
          sso_employee: 750,
          sso_employer: 750,
          net_pay: 14250,
        },
        { name: 'Hein' },
        [
          {
            id: 'adv2',
            staff_id: 's1',
            payroll_period_id: 'p1',
            paid_on: '2026-07-30',
            amount: 1000,
            kind: 'advance',
            payment_method: 'cash',
            note: null,
            expense_ledger_id: null,
            created_at: '2026-07-30T00:00:00Z',
          },
        ],
      ),
    )
    expect(statementReconciles(st)).toBe(true)
    expect(st.total).toBe(14250)
    expect(st.paidToday).toBe(13250)
    expect(st.rows.find((r) => r.key === 'absence')?.sub).toContain('nothing deducted')
  })
})

describe('company constants — required on every payslip (LPA §115)', () => {
  it('carries the 13-digit registration number as the tax ID', () => {
    // In Thailand the company registration number IS the tax ID (LEG-001).
    expect(COMPANY_TAX_ID).toBe('0835568025951')
    expect(COMPANY_TAX_ID).toHaveLength(13)
  })

  it('carries the registered address and the SSO employer account', () => {
    expect(COMPANY_ADDRESS).toMatch(/Rawai/)
    expect(COMPANY_SSO_ACCOUNT).toBe('8330006310')
  })
})
