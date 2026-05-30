import { useState } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import type { PayslipData } from '../../hooks/use-payroll'
import { PayslipPdf } from './PayslipPdf'
import {
  COMPANY_NAME,
  derivePayslip,
  formatDate,
  periodLabel,
  periodSlug,
  safeName,
  thb,
} from './payslip-helpers'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  )
}

function LineRow({
  label,
  value,
  strong,
  border,
}: {
  label: string
  value: string
  strong?: boolean
  border?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between py-1 text-sm',
        border ? 'border-t border-slate-700 pt-1.5' : '',
        strong ? 'font-semibold text-slate-100' : 'text-slate-300',
      ].join(' ')}
    >
      <span>{label}</span>
      <span>{value}</span>
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

  async function handleDownload() {
    setDownloading(true)
    try {
      const blob = await pdf(<PayslipPdf data={data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `payslip_${safeName(staff.name)}_${periodSlug(period.period_start)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

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
            Payslip — {staff.name} · {periodLabel(period.period_start)}
          </h2>
          <div className="flex items-center gap-2">
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
          {/* Header */}
          <div className="border-b-2 border-emerald-700 pb-3">
            <p className="text-base font-bold text-emerald-400">{COMPANY_NAME}</p>
            <p className="text-xs text-slate-400">Payslip / Расчётный листок</p>
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
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
                label="Name"
                value={`${staff.name}${staff.name_th ? ` (${staff.name_th})` : ''}`}
              />
              <Field label="Role" value={staff.role} />
              <Field label="Nationality" value={staff.nationality ?? '—'} />
              <Field label="Hire date" value={formatDate(staff.hire_date)} />
              <Field
                label="Employment type"
                value={staff.employment_type ?? '—'}
              />
              <Field
                label="Social Security No."
                value={staff.sso_number ?? 'Not enrolled'}
              />
            </div>
          </div>

          {/* Earnings + Deductions */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Earnings
              </p>
              <LineRow label="Base salary" value={thb(line.base_salary)} />
              <LineRow label="Overtime" value={thb(line.overtime_pay)} />
              <LineRow label="Gross" value={thb(d.gross)} strong border />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Deductions
              </p>
              <LineRow label="Absence" value={thb(line.absence_deduction)} />
              <LineRow
                label="Social Security (5%)"
                value={thb(line.sso_employee)}
              />
              <LineRow
                label="Withholding tax"
                value={thb(line.withholding_tax)}
              />
              <LineRow label="Other" value={thb(line.other_deductions)} />
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Calendar days" value={String(d.calendarDays)} />
              <Field label="Days worked" value={String(line.days_worked)} />
              <Field label="Unpaid absences" value={String(line.days_absent)} />
              <Field label="Paid leave" value={String(line.days_leave_paid)} />
            </div>
          </div>

          {/* Net */}
          <div className="flex items-center justify-between rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-emerald-300">
              Net pay
            </span>
            <span className="text-2xl font-bold text-emerald-300">
              {thb(d.net)}
            </span>
          </div>

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
