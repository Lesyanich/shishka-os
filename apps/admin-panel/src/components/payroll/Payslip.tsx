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
  buildPayslipStatement,
  derivePayslip,
  formatDate,
  isCallNameOnly,
  legalName,
  orMissing,
  periodLabel,
  periodSlug,
  safeName,
  signedThb,
  thb,
} from './payslip-helpers'

/**
 * One line in the running money column.
 *
 * Right-aligned tabular numerals so the digits stack — the whole point of the
 * single-column layout (CEO rule 1, MC b4876c65) is that the employee can run
 * a finger down it and check the subtraction. A two-column Earnings|Deductions
 * layout is traditional but the eye cannot subtract across a gutter.
 */
function MoneyLine({
  label,
  sub,
  amount,
  dim,
  unsigned,
}: {
  label: string
  sub?: string
  amount: number
  dim?: boolean
  unsigned?: boolean
}) {
  const tone = dim
    ? 'text-slate-500'
    : amount < 0
      ? 'text-rose-300'
      : 'text-slate-200'

  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800 py-1.5">
      <span className={`text-sm ${dim ? 'text-slate-500' : 'text-slate-300'}`}>
        {label}
        {sub && (
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
            {sub}
          </span>
        )}
      </span>
      <span className={`shrink-0 text-sm tabular-nums ${tone}`}>
        {unsigned ? thb(amount) : signedThb(amount)}
      </span>
    </div>
  )
}

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

export function Payslip({
  data,
  onClose,
}: {
  data: PayslipData
  onClose: () => void
}) {
  const { line, staff, period } = data
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

  const st = buildPayslipStatement(data)

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

          {/* Employee — name only. CEO decision 2026-07-31 (MC b4876c65 §B):
              nationality, DOB, position, start date, employment type, SSO number,
              tax ID and address were all removed as noise on a monthly wage slip. */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
              Employee
            </p>
            <Field
              label="Name"
              value={
                legalName(staff) + (staff.name_th ? ` · ${staff.name_th}` : '')
              }
              muted={isCallNameOnly(staff)}
            />
            {isCallNameOnly(staff) && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300/80">
                Showing the call-name — the legal name has not been collected yet.
              </p>
            )}
          </div>

          {/* The money — one running column, no GROSS subtotal, bonus last.
              CEO decision 2026-07-31 (MC b4876c65). The wage base still exists
              in derivePayslip().gross for the payroll register and สปส.1-10;
              it is deliberately not printed here. */}
          <div>
            {st.rows.map((r) => (
              <MoneyLine
                key={r.key}
                label={r.label}
                sub={r.sub}
                amount={r.amount}
                dim={r.dim}
                unsigned={r.unsigned}
              />
            ))}

            {/* Checkpoint 1 — the month's entitlement. Shown only when
                something has already been handed over; with no advance it
                would just repeat the figure below it. */}
            {st.hasSettlements && (
              <div className="flex items-center justify-between gap-4 border-t-2 border-slate-600 py-2">
                <span className="text-sm font-semibold text-slate-100">
                  {st.totalLabel}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">
                  {thb(st.total)}
                </span>
              </div>
            )}

            {st.settlements.map((s) => (
              <MoneyLine key={s.key} label={s.label} sub={s.sub} amount={s.amount} />
            ))}
          </div>

          {/* Checkpoint 2 — the figure being acknowledged by the signature. */}
          <div className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-300">
                Paid to you today
              </span>
              <span className="shrink-0 text-2xl font-bold tabular-nums text-emerald-300">
                {thb(st.paidToday)}
              </span>
            </div>
            <p className="mt-2 text-[10px] text-emerald-200/50">
              Paid in cash. Daily rate = monthly salary ÷ 30 (LPA §68).
            </p>
          </div>

          {/* Attendance — context, never arithmetic. It sits below the money so
              it cannot be read as part of the calculation (CEO rule 7). */}
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

          {/* Employer-paid — information only, never in the deduction column.
              LPA §76 and the Royal Decree on the Management of Foreign Workers
              forbid recovering these from wages, so the slip must not let them
              read as something taken off the employee. */}
          {d.hasEmployerPaid && (
            <p className="rounded bg-slate-800/60 px-3 py-2 text-[11px] text-slate-400">
              Employer-paid, not deducted from your pay: social security{' '}
              {thb(d.employerSso)}.
            </p>
          )}

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
