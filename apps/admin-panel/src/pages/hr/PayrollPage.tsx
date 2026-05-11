import { useState } from 'react'
import {
  Plus,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import {
  usePayroll,
  type PayrollPeriod,
  type PayrollLine,
} from '../../hooks/use-payroll'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  calculated: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  paid: 'bg-sky-500/15 text-sky-300',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function thb(n: number) {
  return `฿${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function NewPeriodForm({ onCreate }: { onCreate: (start: string, end: string) => Promise<void> }) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}`

  const [start, setStart] = useState(firstDay)
  const [end, setEnd] = useState(lastDay)
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    setSaving(true)
    await onCreate(start, end)
    setSaving(false)
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-900/50 p-3 ring-1 ring-slate-800">
      <div>
        <label className="text-[10px] text-slate-500">Start</label>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-0.5 block rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-[10px] text-slate-500">End</label>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="mt-0.5 block rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
        />
      </div>
      <button
        onClick={handleCreate}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Create Period
      </button>
    </div>
  )
}

function PeriodRow({
  period,
  onCalculate,
  onApprove,
  getLines,
}: {
  period: PayrollPeriod
  onCalculate: (id: string) => Promise<void>
  onApprove: (id: string) => Promise<void>
  getLines: (id: string) => Promise<PayrollLine[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<PayrollLine[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  async function toggleExpand() {
    if (!expanded) {
      setLoading(true)
      const data = await getLines(period.id)
      setLines(data)
      setLoading(false)
    }
    setExpanded(!expanded)
  }

  async function handleCalculate() {
    setActionLoading(true)
    await onCalculate(period.id)
    const data = await getLines(period.id)
    setLines(data)
    setActionLoading(false)
  }

  async function handleApprove() {
    setActionLoading(true)
    await onApprove(period.id)
    setActionLoading(false)
  }

  const totalNet = lines.reduce((s, l) => s + l.net_pay, 0)

  return (
    <div className="rounded-lg ring-1 ring-slate-800 overflow-hidden">
      {/* Period header */}
      <button
        onClick={toggleExpand}
        className="flex w-full items-center justify-between bg-slate-900/50 px-4 py-3 text-left hover:bg-slate-900/70 transition"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          )}
          <span className="text-sm font-medium text-slate-200">
            {formatDate(period.period_start)} — {formatDate(period.period_end)}
          </span>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[period.status]}`}>
            {period.status}
          </span>
        </div>
        {lines.length > 0 && (
          <span className="text-xs text-slate-400">{thb(totalNet)}</span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-800 bg-slate-950/50 p-4 space-y-3">
          {/* Actions */}
          <div className="flex gap-2">
            {period.status === 'draft' && (
              <button
                onClick={handleCalculate}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Calculator className="h-3 w-3" />
                )}
                Calculate
              </button>
            )}
            {period.status === 'calculated' && (
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Approve & Create Expenses
              </button>
            )}
            {period.status === 'approved' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approved by {period.approved_by} · expenses created in ledger
              </span>
            )}
          </div>

          {/* Payroll lines table */}
          {loading ? (
            <div className="flex items-center justify-center py-4 text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading lines...
            </div>
          ) : lines.length > 0 ? (
            <div className="overflow-x-auto rounded-lg ring-1 ring-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-900/60 text-slate-400">
                    <th className="px-3 py-2 text-left font-medium">Staff</th>
                    <th className="px-2 py-2 text-right font-medium">Days</th>
                    <th className="px-2 py-2 text-right font-medium">Absent</th>
                    <th className="px-2 py-2 text-right font-medium">Leave</th>
                    <th className="px-2 py-2 text-right font-medium">Base</th>
                    <th className="px-2 py-2 text-right font-medium">OT</th>
                    <th className="px-2 py-2 text-right font-medium">Deduct</th>
                    <th className="px-2 py-2 text-right font-medium">SSO</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {lines.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-900/30">
                      <td className="px-3 py-2 font-medium text-slate-300">{l.staff_name}</td>
                      <td className="px-2 py-2 text-right text-slate-400">{l.days_worked}</td>
                      <td className="px-2 py-2 text-right text-red-400">{l.days_absent || '—'}</td>
                      <td className="px-2 py-2 text-right text-sky-400">{l.days_leave_paid || '—'}</td>
                      <td className="px-2 py-2 text-right text-slate-300">{thb(l.base_salary)}</td>
                      <td className="px-2 py-2 text-right text-amber-400">{l.overtime_pay ? thb(l.overtime_pay) : '—'}</td>
                      <td className="px-2 py-2 text-right text-red-400">{l.absence_deduction ? thb(l.absence_deduction) : '—'}</td>
                      <td className="px-2 py-2 text-right text-slate-400">{thb(l.sso_employee)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-400">{thb(l.net_pay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900/40">
                    <td colSpan={8} className="px-3 py-2 text-right text-xs font-medium text-slate-400">
                      Total Net Pay
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-emerald-300">
                      {thb(totalNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-slate-600">
              No payroll lines yet. Click "Calculate" to compute.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function PayrollPage() {
  const { periods, isLoading, createPeriod, calculatePayroll, approvePayroll, getLines } =
    usePayroll()
  const [showForm, setShowForm] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading payroll...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Create period */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{periods.length} period(s)</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700"
        >
          <Plus className="h-3 w-3" />
          New Period
        </button>
      </div>

      {showForm && (
        <NewPeriodForm
          onCreate={async (start, end) => {
            await createPeriod(start, end)
            setShowForm(false)
          }}
        />
      )}

      {/* Periods list */}
      <div className="space-y-2">
        {periods.map((p) => (
          <PeriodRow
            key={p.id}
            period={p}
            onCalculate={async (id) => { await calculatePayroll(id) }}
            onApprove={async (id) => { await approvePayroll(id) }}
            getLines={getLines}
          />
        ))}
      </div>

      {periods.length === 0 && !showForm && (
        <div className="rounded-lg bg-slate-900/30 py-12 text-center">
          <p className="text-sm text-slate-500">No payroll periods yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Create a period, fill attendance, then calculate payroll
          </p>
        </div>
      )}
    </div>
  )
}

export default PayrollPage
