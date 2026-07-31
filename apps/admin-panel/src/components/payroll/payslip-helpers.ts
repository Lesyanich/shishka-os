import type { PayslipData } from '../../hooks/use-payroll'

/** Format a THB amount, no decimals: ฿14,032 (HTML/screen — browser fonts render ฿). */
export function thb(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Signed THB for the screen: −฿600, +฿800, ฿0.
 *
 * The sign is printed, never inferred. CEO layout rule 3 (MC b4876c65): the
 * slip is a single running column the employee can check with a finger, so a
 * subtraction has to be visible as a subtraction.
 */
export function signedThb(n: number): string {
  if (n === 0) return thb(0)
  return n < 0 ? `−${thb(Math.abs(n))}` : `+${thb(n)}`
}

/**
 * Signed THB for the PDF: -THB 600, +THB 800.
 * ASCII hyphen, not U+2212 — built-in Helvetica is WinAnsi and has no glyph
 * for the typographic minus (it would render as "?").
 */
export function signedThbPdf(n: number): string {
  if (n === 0) return thbPdf(0)
  return n < 0 ? `-${thbPdf(Math.abs(n))}` : `+${thbPdf(n)}`
}

/**
 * PDF-safe THB format: "THB 14,032".
 * The PDF uses built-in Helvetica (WinAnsi), which has no glyph for ฿ (U+0E3F)
 * — it renders as "?". Use the ISO code in the generated PDF instead.
 */
export function thbPdf(n: number): string {
  return `THB ${Math.round(n).toLocaleString('en-US')}`
}

/** "May 2026" from a period_start ISO date. */
export function periodLabel(periodStartIso: string): string {
  const d = new Date(periodStartIso)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** "2026-05" slug for filenames. */
export function periodSlug(periodStartIso: string): string {
  return periodStartIso.slice(0, 7)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Sanitize a staff name into a filename-safe token. */
export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

/**
 * Full legal name for the payslip header.
 *
 * `staff.name` is the call-name the kitchen uses ("Mint", "Hein"). A wage
 * document needs the name as it appears on the passport or Thai ID, so prefer
 * the legal fields and fall back to the call-name while they are still being
 * collected (MC 627a0cb9).
 */
export function legalName(staff: PayslipData['staff']): string {
  const parts = [staff.legal_name_first, staff.legal_name_last].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : staff.name
}

/** True when we are still showing a call-name because the legal one is missing. */
export function isCallNameOnly(staff: PayslipData['staff']): boolean {
  return !staff.legal_name_first && !staff.legal_name_last
}

/**
 * Employer block. Required on the payslip (LPA §115 employee register), and
 * these values do not live anywhere in the DB yet — collection is MC 627a0cb9.
 * `null` renders as an explicit "Not on file" rather than silently vanishing:
 * a missing statutory field should be visible, not invisible.
 */
export const COMPANY_NAME = 'Shishka Healthy Food Company Limited'
/** In Thailand the 13-digit company registration number IS the tax ID (LEG-001). */
export const COMPANY_TAX_ID: string | null = '0835568025951'
export const COMPANY_ADDRESS: string | null = '86/139 Moo 7, Rawai'
export const COMPANY_SSO_ACCOUNT: string | null = '8330006310'

/** Renders a value that may not have been collected yet. */
export function orMissing(v: string | null | undefined): string {
  return v && v.length > 0 ? v : 'Not on file'
}

export interface PayslipDerived {
  /**
   * Total earnings before deductions.
   *
   * DELIBERATELY NOT PRINTED on the payslip — CEO decision 2026-07-31
   * (MC b4876c65): "a subtotal that mixes salary with a bonus is not a figure
   * the employee earned and it invites the wrong reading". It stays here
   * because the payroll register still needs a wage base: this is the figure
   * that underpins สปส.1-10, and what is filed must equal what is held.
   */
  gross: number
  totalDeductions: number
  /** Entitlement for the month — what was earned, before anything was handed over. */
  net: number
  /** Sum of advances already paid against this period. */
  advancesPaid: number
  /** What is still owed at month end: net − advances. */
  balanceDue: number
  calendarDays: number
  /** Employer-paid SSO 5% match (from the stored line). Not deducted from the employee. */
  employerSso: number
  /** True when there is at least one employer-paid item to display. */
  hasEmployerPaid: boolean
  /** True when lateness is worth showing at all. */
  hasLateness: boolean
  /** Anything in other_deductions beyond the late deduction it normally carries. */
  otherBeyondLate: number
}

/**
 * Derive display totals from the STORED payroll_lines row.
 * Never recompute pay — these are presentation rollups of stored values.
 *
 * Two deliberate absences:
 *  - The work-permit / visa figure is NOT surfaced. It is an HR cost, not part
 *    of the employee's wage, and printing it beside their net pay invites the
 *    set-off that LPA §76 and the Royal Decree on the Management of Foreign
 *    Workers prohibit. It stays in `staff.work_permit_annual_thb` for finance.
 *  - Advances are NOT a deduction. They sit below net pay, never inside
 *    totalDeductions, so they cannot touch the SSO or tax base.
 */
export function derivePayslip(data: PayslipData): PayslipDerived {
  const { line, period } = data
  const gross = line.base_salary + line.overtime_pay + line.bonus_pay
  // other_deductions is the monetary channel the late deduction travels in, so
  // it is summed once here and split for display below — never counted twice.
  const totalDeductions =
    line.absence_deduction +
    line.other_deductions +
    line.sso_employee +
    line.withholding_tax
  const otherBeyondLate = Math.max(line.other_deductions - line.late_deduction, 0)
  const start = new Date(period.period_start)
  const end = new Date(period.period_end)
  const calendarDays =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const employerSso = line.sso_employer
  const advancesPaid = data.advancesPaid ?? 0
  return {
    gross,
    totalDeductions,
    net: line.net_pay,
    advancesPaid,
    balanceDue: line.net_pay - advancesPaid,
    calendarDays,
    employerSso,
    hasEmployerPaid: employerSso > 0,
    hasLateness: line.late_days > 0 || line.late_deduction > 0,
    otherBeyondLate,
  }
}

/** One line in the running money column. `amount` is signed. */
export interface PayslipRow {
  key: string
  label: string
  /** The basis, in words. A figure the employee cannot check is a figure they cannot trust. */
  sub?: string
  amount: number
  /** A zero kept because it answers a question — rendered quietly. */
  dim?: boolean
  /**
   * Printed without a leading +. Only the base salary: it is the starting
   * figure, not an adjustment to something. Everything after it is an
   * adjustment and carries its sign, per the CEO's mock-up.
   */
  unsigned?: boolean
}

/** The settlement block below the month's total: what has already been handed over. */
export interface PayslipSettlement {
  key: string
  label: string
  sub?: string
  amount: number
}

export interface PayslipStatement {
  /** The running column, in print order. Signs included; sums to `total`. */
  rows: PayslipRow[]
  /** "Total paid July 2026" — the month's entitlement (stored net_pay). */
  total: number
  totalLabel: string
  /** Advances and other cash already paid against this period. */
  settlements: PayslipSettlement[]
  /** "PAID TO YOU TODAY" — the figure being acknowledged over the signature. */
  paidToday: number
  /** True when a settlement actually exists, so the month total is a real checkpoint. */
  hasSettlements: boolean
}

/**
 * Build the payslip's money column.
 *
 * The order is the CEO's, decided 2026-07-31 (MC b4876c65) and not arbitrary:
 *
 *   base salary → overtime → deductions → BONUS LAST → total → less advances → paid today
 *
 * Three things follow from that decision and must not be quietly undone:
 *  - **No GROSS line.** A subtotal mixing salary with a discretionary bonus is
 *    not a figure the employee earned. `derivePayslip().gross` still holds it
 *    for the register and the สปส.1-10 filing; the slip does not print it.
 *  - **The bonus sits after the deductions**, because it is the final
 *    adjustment the employer makes, not part of an earnings block.
 *  - **Advances are never deductions.** They live below the month's total, in
 *    `settlements`, so they cannot touch the SSO or tax base. LPA §76 permits a
 *    closed list of deductions and "money we already gave you" is on none of
 *    them — it was never a deduction, the employee has the money.
 *
 * Zero rows survive only when they answer a question (rule 6); they come back
 * marked `dim` so the renderer can mute them. A zero with nothing to say is
 * dropped entirely.
 *
 * `pdf` swaps in ASCII for the built-in Helvetica used by the PDF, which is
 * WinAnsi and cannot render § or the typographic minus.
 */
export function buildPayslipStatement(
  data: PayslipData,
  opts: { pdf?: boolean } = {},
): PayslipStatement {
  const { line, staff, period, payments } = data
  const d = derivePayslip(data)
  const pdf = opts.pdf === true
  const money = pdf ? thbPdf : thb
  const s = (section: string) => (pdf ? `LPA s.${section}` : `LPA §${section}`)

  const dailyRate = staff.monthly_salary ? staff.monthly_salary / 30 : 0
  const rows: PayslipRow[] = []

  /** Negate for the deduction column, without producing -0 for a zero row. */
  const neg = (n: number) => (n === 0 ? 0 : -n)

  rows.push({
    key: 'base',
    label: 'Base salary',
    sub: staff.monthly_salary
      ? `contract ${money(staff.monthly_salary)} per month`
      : undefined,
    amount: line.base_salary,
    unsigned: true,
  })

  // Overtime stays at zero: "was I paid for the extra hours?" is a question the
  // slip should answer even when the answer is none.
  rows.push({
    key: 'overtime',
    label: 'Overtime',
    sub: line.overtime_pay > 0 ? `at the ${s('61')} rates` : 'none worked',
    amount: line.overtime_pay,
    dim: line.overtime_pay === 0,
  })

  rows.push({
    key: 'absence',
    label: 'Unpaid absence',
    sub:
      line.days_absent > 0
        ? `${line.days_absent} day(s) × ${money(dailyRate)} — monthly ÷ 30, ${s('68')}`
        : 'none — nothing deducted',
    amount: neg(line.absence_deduction),
    dim: line.absence_deduction === 0,
  })

  // Lateness appears only when there was lateness. Showing it at zero for
  // everyone else would imply a suspicion the record does not support.
  if (d.hasLateness) {
    rows.push({
      key: 'late',
      label: 'Late arrivals',
      sub:
        line.late_deduction > 0
          ? `${line.late_days} day(s), ${line.late_minutes} min unworked`
          : `${line.late_days} day(s), ${line.late_minutes} min — recorded, not deducted`,
      amount: neg(line.late_deduction),
      dim: line.late_deduction === 0,
    })
  }

  rows.push({
    key: 'sso',
    label: 'Social security 5%',
    sub:
      line.sso_employee > 0
        ? `on the capped base, ${money(17500)} max — ${s('76(1)')}`
        : 'not enrolled for this period — nothing withheld',
    amount: neg(line.sso_employee),
    dim: line.sso_employee === 0,
  })

  rows.push({
    key: 'wht',
    label: 'Withholding tax',
    sub:
      line.withholding_tax > 0
        ? 'monthly slice of the annual liability'
        : 'below the taxable threshold',
    amount: neg(line.withholding_tax),
    dim: line.withholding_tax === 0,
  })

  if (d.otherBeyondLate > 0) {
    rows.push({
      key: 'other',
      label: 'Other deductions',
      amount: neg(d.otherBeyondLate),
    })
  }

  // Last, by CEO decision. Dropped entirely when zero — an unexplained zero
  // bonus answers no question.
  if (line.bonus_pay > 0) {
    rows.push({
      key: 'bonus',
      label: 'Bonus',
      sub: line.bonus_note ?? undefined,
      amount: line.bonus_pay,
    })
  }

  const settlements: PayslipSettlement[] = payments.map((p) => ({
    key: p.id,
    label: `${p.kind === 'advance' ? 'Advance already paid' : p.kind} — ${formatDate(p.paid_on)}, ${p.payment_method}`,
    sub: p.note ?? undefined,
    amount: neg(p.amount),
  }))

  return {
    rows,
    total: d.net,
    totalLabel: `Total paid ${periodLabel(period.period_start)}`,
    settlements,
    paidToday: d.balanceDue,
    hasSettlements: settlements.length > 0,
  }
}

/**
 * The slip's own arithmetic check: the printed column must add up to the
 * printed total. Any drift means the document disagrees with what was paid,
 * which is the one thing a payslip may never do.
 */
export function statementReconciles(st: PayslipStatement): boolean {
  const sum = st.rows.reduce((acc, r) => acc + r.amount, 0)
  return Math.abs(sum - st.total) < 0.005
}
