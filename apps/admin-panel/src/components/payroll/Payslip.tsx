import { useState } from 'react'
import { Check, Download, Link2, Loader2, X } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import type { PayslipData } from '../../hooks/use-payroll'
import { PayslipPdf } from './PayslipPdf'
import {
  COMPANY_ADDRESS,
  COMPANY_NAME,
  COMPANY_SSO_ACCOUNT,
  COMPANY_TAX_ID,
  derivePayslip,
  formatDate,
  isCallNameOnly,
  legalName,
  orMissing,
  periodLabel,
  periodSlug,
  safeName,
  thb,
} from './payslip-helpers'

function Field({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-sm ${muted ? 'text-slate-500 italic' : 'text-slate-200'}`}>
        {value}
      </p>
    </div>
  )
}

function LineRow({
  label,
  sub,
  value,
  strong,
  border,
  tone,
}: {
  label: string
  sub?: string
  value: string
  strong?: boolean
  border?: boolean
  tone?: 'default' | 'muted'
}) {
  return (
    <div
      className={[
        'flex items-start justify-between py-1 text-sm',
        border ? 'border-t border-slate-700 pt-1.5' : '',
        strong ? 'font-semibold text-slate-100' : 'text-slate-300',
      ].join(' ')}
    >
      <span className="pr-3">
        {label}
        {sub && <span className="block text-[10px] text-slate-500">{sub}</span>}
      </span>
      <span className={tone === 'muted' ? 'text-slate-500' : ''}>{value}</span>
    </div>
  )
}

export function Payslip({
  data,
  onClose,
}: {
  data: PayslipData
  onClose: () => void
}) {
  const { line, staff, period, payments } = data
  const d = derivePayslip(data)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  /** This payslip's own address — ?period= and ?payslip= are already in the URL. */
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await pdf(<PayslipPdf data={data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payslip_${safeName(legalName(staff))}_${periodSlug(period.period_start)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const dailyRate = staff.monthly_salary ? staff.monthly_salary / 30 : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-slate-900 ring-1 ring-slate-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-200">
            Payslip — {legalName(staff)} · {periodLabel(period.period_start)}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700"
              title="Copy this payslip's link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Document body */}
        <div className="space-y-5 p-6">
          {/* Employer */}
          <div className="border-b-2 border-emerald-700 pb-3">
            <p className="text-base font-bold text-emerald-400">{COMPANY_NAME}</p>
            <p className="text-[11px] text-slate-500">
              Tax ID: {orMissing(COMPANY_TAX_ID)} · SSO acct:{' '}
              {orMissing(COMPANY_SSO_ACCOUNT)}
            </p>
            <p className="text-[11px] text-slate-500">{orMissing(COMPANY_ADDRESS)}</p>
            <p className="mt-1.5 text-xs text-slate-400">Payslip / Salary Statement</p>
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>
                Pay period: {periodLabel(period.period_start)} (
                {formatDate(period.period_start)} – {formatDate(period.period_end)})
              </span>
              <span>Status: {period.status}</span>
            </div>
          </div>

          {/* Employee */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Employee
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Full name"
                value={legalName(staff)}
                muted={isCallNameOnly(staff)}
              />
              <Field label="Name (Thai)" value={staff.name_th ?? 'Not on file'} muted={!staff.name_th} />
              <Field label="Position" value={staff.role} />
              <Field label="Nationality" value={staff.nationality ?? 'Not on file'} muted={!staff.nationality} />
              <Field
                label="Date of birth"
                value={staff.date_of_birth ? formatDate(staff.date_of_birth) : 'Not on file'}
                muted={!staff.date_of_birth}
              />
              <Field label="Employment start" value={formatDate(staff.hire_date)} />
              <Field label="Employment type" value={staff.employment_type ?? '—'} />
              <Field
                label="Social Security No."
                value={staff.sso_number ?? 'Pending enrolment'}
                muted={!staff.sso_number}
              />
              <Field label="Tax ID" value={staff.tax_id ?? 'Not on file'} muted={!staff.tax_id} />
              <Field
                label="Address"
                value={staff.address ?? 'Not on file'}
                muted={!staff.address}
              />
              {staff.work_permit_number && (
                <Field
                  label="Work permit"
                  value={`${staff.work_permit_number}${
                    staff.work_permit_expiry
                      ? ` (exp. ${formatDate(staff.work_permit_expiry)})`
                      : ''
                  }`}
                />
              )}
            </div>
            {isCallNameOnly(staff) && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300/80">
                Showing the call-name — the legal name has not been collected yet.
              </p>
            )}
          </div>

          {/* Earnings + Deductions */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Earnings
              </p>
              <LineRow
                label="Base salary"
                sub={
                  staff.monthly_salary
                    ? `contract ${thb(staff.monthly_salary)}/month`
                    : undefined
                }
                value={thb(line.base_salary)}
              />
              <LineRow label="Overtime" value={thb(line.overtime_pay)} />
              <LineRow
                label="Bonus"
                sub={line.bonus_note ?? undefined}
                value={thb(line.bonus_pay)}
              />
              <LineRow label="Gross" value={thb(d.gross)} strong border />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Deductions
              </p>
              <LineRow
                label="Unpaid absence"
                sub={
                  line.days_absent > 0
                    ? `${line.days_absent} day(s) × ${thb(dailyRate)} (monthly ÷ 30)`
                    : undefined
                }
                value={thb(line.absence_deduction)}
              />
              <LineRow
                label="Late arrivals"
                sub={
                  line.late_days > 0
                    ? `${line.late_days} day(s), ${line.late_minutes} min unworked`
                    : undefined
                }
                value={thb(line.late_deduction)}
              />
              <LineRow
                label="Social Security (5%)"
                sub={
                  line.sso_employee > 0
                    ? 'on the capped base'
                    : 'not enrolled — nothing withheld'
                }
                value={thb(line.sso_employee)}
              />
              <LineRow
                label="Withholding tax"
                sub={
                  line.withholding_tax === 0
                    ? 'below the taxable threshold'
                    : 'monthly slice of the annual liability'
                }
                value={thb(line.withholding_tax)}
              />
              {d.otherBeyondLate > 0 && (
                <LineRow label="Other" value={thb(d.otherBeyondLate)} />
              )}
              <LineRow
                label="Total deductions"
                value={thb(d.totalDeductions)}
                strong
                border
              />
            </div>
          </div>

          {/* Attendance */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Attendance
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Calendar days" value={String(d.calendarDays)} />
              <Field label="Days worked" value={String(line.days_worked)} />
              <Field label="Unpaid absences" value={String(line.days_absent)} />
              <Field label="Paid leave" value={String(line.days_leave_paid)} />
              <Field
                label="Late days"
                value={
                  line.late_days > 0
                    ? `${line.late_days} (${line.late_minutes} min)`
                    : '0'
                }
              />
            </div>
            {data.substituteDaysOwed > 0 && (
              <p className="mt-2 rounded bg-sky-500/10 px-2 py-1 text-[11px] text-sky-300/80">
                {data.substituteDaysOwed} substitute day(s) off still owed for public holidays
                worked (LPA §29).
              </p>
            )}
          </div>

          {/* Employer-paid (not deducted) — SSO match only. */}
          {d.hasEmployerPaid && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Employer contribution
              </p>
              <LineRow
                label="Social Security — employer 5%"
                value={thb(d.employerSso)}
                tone="muted"
              />
            </div>
          )}

          {/* Net + payments */}
          <div className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-300">
                Net pay
              </span>
              <span className="text-2xl font-bold text-emerald-300">{thb(d.net)}</span>
            </div>
            {payments.length > 0 && (
              <div className="mt-2 border-t border-emerald-700/40 pt-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs text-emerald-200/70"
                  >
                    <span>
                      less: {p.kind} paid {formatDate(p.paid_on)}
                      {p.note ? ` — ${p.note}` : ''}
                    </span>
                    <span>−{thb(p.amount)}</span>
                  </div>
                ))}
                <div className="mt-1.5 flex items-center justify-between border-t border-emerald-700/40 pt-1.5 text-sm font-semibold text-emerald-300">
                  <span>Balance due</span>
                  <span>{thb(d.balanceDue)}</span>
                </div>
              </div>
            )}
            <p className="mt-2 text-[10px] text-emerald-200/50">
              Paid in cash. Daily rate = monthly salary ÷ 30 (LPA §68).
            </p>
          </div>

          {line.notes && (
            <p className="rounded bg-slate-800/60 px-3 py-2 text-[11px] text-slate-400">
              {line.notes}
            </p>
          )}

          {/* Signatures */}
          <div className="flex justify-between gap-6 pt-6">
            <div className="flex-1">
              <div className="border-t border-slate-600 pt-1 text-center text-[10px] text-slate-500">
                Employer signature
              </div>
            </div>
            <div className="flex-1">
              <div className="border-t border-slate-600 pt-1 text-center text-[10px] text-slate-500">
                Employee signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Payslip
