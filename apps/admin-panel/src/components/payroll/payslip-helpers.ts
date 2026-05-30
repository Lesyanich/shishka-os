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

export interface PayslipDerived {
  gross: number
  totalDeductions: number
  net: number
  calendarDays: number
  /** Employer-paid SSO 5% match (from the stored line). Not deducted from the employee. */
  employerSso: number
  /** Employer-paid annual work permit + visa cost. Not deducted from the employee. */
  workPermitAnnual: number
  /** True when there is at least one employer-paid benefit to display. */
  hasEmployerPaid: boolean
}

/**
 * Derive display totals from the STORED payroll_lines row.
 * Never recompute pay — these are presentation rollups of stored values.
 */
export function derivePayslip(data: PayslipData): PayslipDerived {
  const { line, period } = data
  const gross = line.base_salary + line.overtime_pay
  const totalDeductions =
    line.absence_deduction +
    line.sso_employee +
    line.withholding_tax +
    line.other_deductions
  const start = new Date(period.period_start)
  const end = new Date(period.period_end)
  const calendarDays =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const employerSso = line.sso_employer
  const workPermitAnnual = data.staff.work_permit_annual_thb ?? 0
  return {
    gross,
    totalDeductions,
    net: line.net_pay,
    calendarDays,
    employerSso,
    workPermitAnnual,
    hasEmployerPaid: employerSso > 0 || workPermitAnnual > 0,
  }
}

export const COMPANY_NAME = 'Shishka Healthy Food Company Limited'
