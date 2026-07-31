import type { PayslipData } from '../../hooks/use-payroll'

/** Format a THB amount, no decimals: ฿14,032 (HTML/screen — browser fonts render ฿). */
export function thb(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`
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
