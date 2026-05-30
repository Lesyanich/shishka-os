import type { PayslipData } from '../../hooks/use-payroll'

/** Format a THB amount, no decimals: ฿14,032 */
export function thb(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`
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
  return { gross, totalDeductions, net: line.net_pay, calendarDays }
}

export const COMPANY_NAME = 'Shishka Healthy Food Company Limited'
