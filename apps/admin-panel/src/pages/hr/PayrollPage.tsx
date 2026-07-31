import { useState } from 'react'
import {
  Plus,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Gift,
  Loader2,
  Lock,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import {
  usePayroll,
  type PayrollPeriod,
  type PayrollLine,
  type PayslipData,
  type StaffPayment,
} from '../../hooks/use-payroll'
import { Payslip } from '../../components/payroll/Payslip'

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

/** Inline editor for a discretionary bonus on one line. */
function BonusEditor({
  line,
  onSave,
  onClose,
}: {
  line: PayrollLine
  onSave: (amount: number, note: string) => Promise<void>
  onClose: () => void
}) {
  const [amount, setAmount] = useState(String(line.bonus_pay || ''))
  const [note, setNote] = useState(line.bonus_note ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await onSave(Number(amount) || 0, note)
    setSaving(false)
    onClose()
  }

  return (
    <tr className="bg-slate-900/60">
      <td colSpan={12} className="px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-slate-500">Bonus (THB)</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-0.5 block w-28 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>
          <div className="min-w-[16rem] flex-1">
            <label className="text-[10px] text-slate-500">Reason (appears on the payslip)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. performance bonus offsetting unpaid leave"
              className="mt-0.5 block w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save bonus'}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          A bonus survives recalculation — it is never overwritten by Calculate.
        </p>
      </td>
    </tr>
  )
}

/** Record an advance / part payment against one line. */
function PaymentEditor({
  line,
  period,
  payments,
  onAdd,
  onDelete,
  onClose,
}: {
  line: PayrollLine
  period: PayrollPeriod
  payments: StaffPayment[]
  onAdd: (paidOn: string, amount: number, kind: StaffPayment['kind'], note: string) => Promise<string | null>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [paidOn, setPaidOn] = useState(period.period_end)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const already = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = line.net_pay - already

  async function save() {
    setSaving(true)
    setError(await onAdd(paidOn, Number(amount) || 0, 'advance', note))
    setSaving(false)
    setAmount('')
  }

  return (
    <tr className="bg-slate-900/60">
      <td colSpan={12} className="px-3 py-2">
        {payments.length > 0 && (
          <div className="mb-2 space-y-1">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="w-24">{formatDate(p.paid_on)}</span>
                <span className="w-20 text-right text-slate-300">{thb(p.amount)}</span>
                <span className="w-16 text-slate-500">{p.kind}</span>
                <span className="flex-1 truncate text-slate-500">{p.note ?? ''}</span>
                <button
                  onClick={() => onDelete(p.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-slate-500">Paid on</label>
            <input
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="mt-0.5 block rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">Amount (THB)</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-0.5 block w-28 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
            />
          </div>
          <div className="min-w-[14rem] flex-1">
            <label className="text-[10px] text-slate-500">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. requested advance, first half"
              className="mt-0.5 block w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
            />
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Record payment'}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          Remaining after payments recorded: <span className="text-slate-400">{thb(remaining)}</span>.
          An advance may not exceed the wage earned so far — it must stay a wage advance, not a loan.
        </p>
        {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      </td>
    </tr>
  )
}

function PeriodRow({
  period,
  onCalculate,
  onReopen,
  onApprove,
  onMarkPunctuality,
  getLines,
  getPayments,
  setBonus,
  addPayment,
  deletePayment,
  getPayslip,
}: {
  period: PayrollPeriod
  onCalculate: (id: string) => Promise<void>
  onReopen: (id: string) => Promise<void>
  onApprove: (id: string) => Promise<string | null>
  onMarkPunctuality: (id: string) => Promise<void>
  getLines: (id: string) => Promise<PayrollLine[]>
  getPayments: (periodId: string, staffId: string) => Promise<StaffPayment[]>
  setBonus: (line: PayrollLine, amount: number, note: string) => Promise<void>
  addPayment: (
    line: PayrollLine,
    paidOn: string,
    amount: number,
    kind: StaffPayment['kind'],
    note: string,
  ) => Promise<string | null>
  deletePayment: (id: string) => Promise<void>
  getPayslip: (periodId: string, staffId: string) => Promise<PayslipData | null>
}) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<PayrollLine[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [payslip, setPayslip] = useState<PayslipData | null>(null)
  const [payslipLoadingId, setPayslipLoadingId] = useState<string | null>(null)
  const [bonusFor, setBonusFor] = useState<string | null>(null)
  const [paymentFor, setPaymentFor] = useState<string | null>(null)
  const [paymentRows, setPaymentRows] = useState<StaffPayment[]>([])
  const [approveError, setApproveError] = useState<string | null>(null)

  async function refreshLines() {
    const data = await getLines(period.id)
    setLines(data)
  }

  async function openPayslip(staffId: string) {
    setPayslipLoadingId(staffId)
    const data = await getPayslip(period.id, staffId)
    setPayslipLoadingId(null)
    if (data) setPayslip(data)
  }

  async function toggleExpand() {
    if (!expanded) {
      setLoading(true)
      await refreshLines()
      setLoading(false)
    }
    setExpanded(!expanded)
  }

  async function handleCalculate() {
    setActionLoading(true)
    await onCalculate(period.id)
    await refreshLines()
    setActionLoading(false)
  }

  async function handleReopen() {
    setActionLoading(true)
    await onReopen(period.id)
    setActionLoading(false)
  }

  async function handleApprove() {
    setActionLoading(true)
    setApproveError(await onApprove(period.id))
    setActionLoading(false)
  }

  async function openPayments(line: PayrollLine) {
    setPaymentRows(await getPayments(period.id, line.staff_id))
    setPaymentFor(line.id)
  }

  const totalNet = lines.reduce((s, l) => s + l.net_pay, 0)
  const totalAdvances = lines.reduce((s, l) => s + (l.advances_paid ?? 0), 0)
  const lateLines = lines.filter((l) => l.late_days > 0)
  const punctualityDone = period.punctuality_reviewed_at !== null
  const punctualityBlocks = lateLines.length > 0 && !punctualityDone

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
          {/* Close-period checklist */}
          {(period.status === 'draft' || period.status === 'calculated') && (
            <div className="rounded-lg bg-slate-900/40 p-3 ring-1 ring-slate-800">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Close-period checklist
              </p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <span className={lines.length > 0 ? 'text-emerald-400' : 'text-slate-600'}>
                    {lines.length > 0 ? '✓' : '○'}
                  </span>
                  <span className="text-slate-400">
                    Calculated — {lines.length} line(s)
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className={!punctualityBlocks ? 'text-emerald-400' : 'text-amber-400'}>
                    {!punctualityBlocks ? '✓' : '○'}
                  </span>
                  <span className="text-slate-400">
                    {lateLines.length === 0
                      ? 'No unexcused lates to review'
                      : punctualityDone
                        ? `Lateness reviewed by ${period.punctuality_reviewed_by ?? '—'}`
                        : `${lateLines.length} staff with unexcused lates — review before approving`}
                  </span>
                  {punctualityBlocks && (
                    <button
                      onClick={() => onMarkPunctuality(period.id)}
                      className="ml-auto flex items-center gap-1 rounded bg-amber-600/20 px-2 py-0.5 text-[11px] text-amber-300 ring-1 ring-amber-600/40 hover:bg-amber-600/30"
                    >
                      <Clock className="h-3 w-3" />
                      Mark reviewed
                    </button>
                  )}
                </li>
                {totalAdvances > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="text-sky-400">✓</span>
                    <span className="text-slate-400">
                      {thb(totalAdvances)} already advanced — only the balance will be booked
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
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
              <>
                <button
                  onClick={handleApprove}
                  disabled={actionLoading || punctualityBlocks}
                  title={punctualityBlocks ? 'Review lateness first' : undefined}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {actionLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Approve &amp; Create Expenses
                </button>
                <button
                  onClick={handleReopen}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:opacity-50"
                  title="Re-open as draft so it can be recalculated. Bonuses and frozen lines survive."
                >
                  <RotateCcw className="h-3 w-3" />
                  Re-open &amp; recalculate
                </button>
              </>
            )}
            {period.status === 'approved' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approved by {period.approved_by} · expenses created in ledger
              </span>
            )}
          </div>

          {approveError && (
            <p className="rounded bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
              {approveError}
            </p>
          )}

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
                    <th className="px-2 py-2 text-right font-medium">Late</th>
                    <th className="px-2 py-2 text-right font-medium">Base</th>
                    <th className="px-2 py-2 text-right font-medium">Bonus</th>
                    <th className="px-2 py-2 text-right font-medium">Deduct</th>
                    <th className="px-2 py-2 text-right font-medium">SSO</th>
                    <th className="px-2 py-2 text-right font-medium">Tax</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-2 py-2 text-right font-medium">Advanced</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-2 py-2 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {lines.map((l) => {
                    const advanced = l.advances_paid ?? 0
                    const totalDeduct = l.absence_deduction + l.other_deductions
                    const editable = period.status === 'draft' || period.status === 'calculated'
                    return [
                      <tr key={l.id} className="hover:bg-slate-900/30">
                        <td className="px-3 py-2 font-medium text-slate-300">
                          <span className="flex items-center gap-1">
                            {l.is_manual_override && (
                              <Lock className="h-3 w-3 text-amber-400" aria-label="Frozen line" />
                            )}
                            {l.staff_name}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right text-slate-400">{l.days_worked}</td>
                        <td className="px-2 py-2 text-right text-red-400">{l.days_absent || '—'}</td>
                        <td className="px-2 py-2 text-right text-sky-400">{l.days_leave_paid || '—'}</td>
                        <td className="px-2 py-2 text-right text-amber-400" title={l.late_minutes ? `${l.late_minutes} unworked minutes` : undefined}>
                          {l.late_days ? `${l.late_days}d · ${l.late_minutes}m` : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-300">{thb(l.base_salary)}</td>
                        <td className="px-2 py-2 text-right text-emerald-400" title={l.bonus_note ?? undefined}>
                          {l.bonus_pay ? thb(l.bonus_pay) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-red-400">{totalDeduct ? thb(totalDeduct) : '—'}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{thb(l.sso_employee)}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{thb(l.withholding_tax)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-400">{thb(l.net_pay)}</td>
                        <td className="px-2 py-2 text-right text-sky-400">{advanced ? thb(advanced) : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-200">
                          {thb(l.net_pay - advanced)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            {editable && (
                              <>
                                <button
                                  onClick={() => { setPaymentFor(null); setBonusFor(bonusFor === l.id ? null : l.id) }}
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-emerald-300"
                                  title="Bonus"
                                >
                                  <Gift className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    setBonusFor(null)
                                    if (paymentFor === l.id) setPaymentFor(null)
                                    else void openPayments(l)
                                  }}
                                  className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-sky-300"
                                  title="Advance / part payment"
                                >
                                  <Wallet className="h-3 w-3" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => openPayslip(l.staff_id)}
                              disabled={payslipLoadingId === l.staff_id}
                              className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-emerald-300 disabled:opacity-50"
                              title="View payslip"
                            >
                              {payslipLoadingId === l.staff_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>,
                      bonusFor === l.id ? (
                        <BonusEditor
                          key={`${l.id}-bonus`}
                          line={l}
                          onSave={async (amount, note) => {
                            await setBonus(l, amount, note)
                            await refreshLines()
                          }}
                          onClose={() => setBonusFor(null)}
                        />
                      ) : null,
                      paymentFor === l.id ? (
                        <PaymentEditor
                          key={`${l.id}-pay`}
                          line={l}
                          period={period}
                          payments={paymentRows}
                          onAdd={async (paidOn, amount, kind, note) => {
                            const err = await addPayment(l, paidOn, amount, kind, note)
                            if (!err) {
                              setPaymentRows(await getPayments(period.id, l.staff_id))
                              await refreshLines()
                            }
                            return err
                          }}
                          onDelete={async (id) => {
                            await deletePayment(id)
                            setPaymentRows(await getPayments(period.id, l.staff_id))
                            await refreshLines()
                          }}
                          onClose={() => setPaymentFor(null)}
                        />
                      ) : null,
                    ]
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900/40">
                    <td colSpan={10} className="px-3 py-2 text-right text-xs font-medium text-slate-400">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-emerald-300">
                      {thb(totalNet)}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-sky-400">
                      {totalAdvances ? thb(totalAdvances) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-slate-200">
                      {thb(totalNet - totalAdvances)}
                    </td>
                    <td />
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

      {payslip && (
        <Payslip data={payslip} onClose={() => setPayslip(null)} />
      )}
    </div>
  )
}

export function PayrollPage() {
  const {
    periods,
    isLoading,
    createPeriod,
    calculatePayroll,
    reopenPeriod,
    approvePayroll,
    markPunctualityReviewed,
    getLines,
    setBonus,
    getPayments,
    addPayment,
    deletePayment,
    getPayslip,
  } = usePayroll()
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
            onReopen={async (id) => { await reopenPeriod(id) }}
            onApprove={async (id) => {
              const { error } = await approvePayroll(id)
              return error ? error.message : null
            }}
            onMarkPunctuality={async (id) => { await markPunctualityReviewed(id, 'lesia') }}
            getLines={getLines}
            getPayments={getPayments}
            setBonus={async (line, amount, note) => { await setBonus(line, amount, note) }}
            addPayment={async (line, paidOn, amount, kind, note) => {
              const { error } = await addPayment(line, paidOn, amount, kind, note)
              return error ? error.message : null
            }}
            deletePayment={async (id) => { await deletePayment(id) }}
            getPayslip={getPayslip}
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
