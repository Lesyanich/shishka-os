import { Fragment, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Plus,
  X,
  Loader2,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { usePunctuality, useTodayPunctuality } from '../../hooks/usePunctuality'
import { useStaffWarnings } from '../../hooks/useStaffWarnings'
import { useAppRole } from '../../contexts/AppRoleContext'
import { formatTime } from '../../lib/staffSchedule'
import {
  lateTrend,
  formatMinutes,
  unworkedTimeValue,
  PUNCH_STATUS_META,
  WARNING_KIND_META,
  type WarningKind,
} from '../../lib/punctuality'

function formatMonth(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const KIND_OPTIONS: WarningKind[] = ['verbal', 'written_1', 'written_2_final']

export function PunctualityPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { staffId: myStaffId } = useAppRole()
  const { staff, byStaff, prevByStaff, isLoading, error } = usePunctuality(year, month)
  const { rows: todayRows, isLoading: todayLoading } = useTodayPunctuality()
  const {
    warnings,
    activeByStaff,
    isSaving,
    error: warningsError,
    addWarning,
    removeWarning,
  } = useStaffWarnings(myStaffId)

  const staffById = new Map(staff.map((s) => [s.id, s]))
  const rostered = staff.filter((s) => s.app_role !== 'owner')

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
    setExpanded(null)
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
    setExpanded(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading punctuality…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/30">
        Failed to load punctuality: {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Today: is the shop open? ── */}
      <section className="rounded-lg bg-slate-900/40 p-3 ring-1 ring-slate-800">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today</h2>
          <span className="text-[11px] text-slate-600">
            Grace {todayRows[0]?.grace_min ?? 10} min after shift start
          </span>
        </div>
        {todayLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : todayRows.length === 0 ? (
          <p className="text-xs text-slate-500">No shifts scheduled today.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {todayRows.map((row) => {
              const meta = PUNCH_STATUS_META[row.punch_status]
              const name = staffById.get(row.staff_id)?.name ?? 'Unknown'
              return (
                <span
                  key={row.shift_id}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${meta.color}`}
                  title={`Shift ${formatTime(row.start_time)}–${formatTime(row.end_time)}${
                    row.first_in_local ? ` · clocked in ${formatTime(row.first_in_local)}` : ''
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {name}
                  <span className="opacity-70">
                    {row.punch_status === 'late'
                      ? `+${row.late_minutes}m`
                      : row.punch_status === 'on_time'
                        ? formatTime(row.first_in_local)
                        : meta.label}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Month nav ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevMonth}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[160px] text-center text-sm font-semibold text-slate-200">
          {formatMonth(year, month)}
        </span>
        <button
          onClick={nextMonth}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Log warning
        </button>
      </div>

      {/* ── Month summary ── */}
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-900/60 text-slate-400">
              <th className="px-3 py-2 text-left font-medium">Staff</th>
              <th className="px-3 py-2 text-center font-medium">On time</th>
              <th className="px-3 py-2 text-center font-medium">Late</th>
              <th className="px-3 py-2 text-center font-medium">Late time</th>
              <th className="px-3 py-2 text-center font-medium">No clock-in</th>
              <th className="px-3 py-2 text-center font-medium">Unpaid value</th>
              <th className="px-3 py-2 text-center font-medium">Trend</th>
              <th className="px-3 py-2 text-left font-medium">Warning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {rostered.map((s) => {
              const stats = byStaff.get(s.id)
              const trend = lateTrend(byStaff, prevByStaff, s.id)
              const active = activeByStaff.get(s.id)
              const isOpen = expanded === s.id
              const lateMinutes = stats?.lateMinutesTotal ?? 0
              const unpaid = unworkedTimeValue(s.monthly_salary ?? 0, lateMinutes)

              return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    className="cursor-pointer hover:bg-slate-900/30"
                  >
                    <td className="px-3 py-2 font-medium text-slate-300 whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-2 text-center text-emerald-400">{stats?.onTimeCount ?? 0}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={stats?.lateCount ? 'font-semibold text-amber-400' : 'text-slate-600'}>
                        {stats?.lateCount ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400">{formatMinutes(lateMinutes)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={stats?.noClockInDays ? 'font-semibold text-rose-400' : 'text-slate-600'}>
                        {stats?.noClockInDays ?? 0}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500" title="LEG-004 §3 — informational; payroll does not apply this automatically">
                      {unpaid > 0 ? `฿${unpaid.toFixed(0)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {trend > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-rose-400">
                          <TrendingUp className="h-3 w-3" />+{trend}
                        </span>
                      ) : trend < 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <TrendingDown className="h-3 w-3" />
                          {trend}
                        </span>
                      ) : (
                        <Minus className="mx-auto h-3 w-3 text-slate-700" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {active ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${WARNING_KIND_META[active.kind].color}`}
                          title={`Issued ${active.issued_on}, valid until ${active.expires_on}`}
                        >
                          <ShieldAlert className="h-3 w-3" />
                          {WARNING_KIND_META[active.kind].label}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-slate-950/60">
                      <td colSpan={8} className="px-3 py-3">
                        {stats && stats.incidents.length > 0 ? (
                          <ul className="space-y-1">
                            {stats.incidents.map((inc) => {
                              const meta = PUNCH_STATUS_META[inc.punch_status]
                              return (
                                <li key={inc.shift_id} className="flex items-center gap-3 text-[11px]">
                                  <span className="w-24 text-slate-500">{formatDay(inc.shift_date)}</span>
                                  <span className="w-24 text-slate-600">
                                    shift {formatTime(inc.start_time)}
                                  </span>
                                  <span className="w-24 text-slate-400">
                                    {inc.first_in_local ? `in ${formatTime(inc.first_in_local)}` : 'no punch'}
                                  </span>
                                  <span className={`rounded px-1.5 py-0.5 font-medium ${meta.color}`}>
                                    {inc.punch_status === 'late' ? `Late ${inc.late_minutes} min` : meta.label}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-slate-600">
                            No lateness or missed clock-ins this month.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Warnings register ── */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Warnings register
        </h2>
        <p className="text-[11px] text-slate-600">
          A written warning enables dismissal for cause without severance under Thai LPA §119(4) and
          stays valid for 1 year. Verbal warnings are logged for the record only.
        </p>
        {warnings.length === 0 ? (
          <p className="rounded-lg bg-slate-900/40 px-3 py-4 text-xs text-slate-500 ring-1 ring-slate-800">
            No warnings on file.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-400">
                  <th className="px-3 py-2 text-left font-medium">Staff</th>
                  <th className="px-3 py-2 text-left font-medium">Kind</th>
                  <th className="px-3 py-2 text-left font-medium">Issued</th>
                  <th className="px-3 py-2 text-left font-medium">Valid until</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Doc</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {warnings.map((w) => {
                  const expired = w.expires_on < new Date().toISOString().slice(0, 10)
                  return (
                    <tr key={w.id} className={expired ? 'text-slate-600' : 'text-slate-300'}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {staffById.get(w.staff_id)?.name ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${WARNING_KIND_META[w.kind].color}`}
                        >
                          {WARNING_KIND_META[w.kind].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{w.issued_on}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {w.expires_on}
                        {expired && <span className="ml-1 text-[10px] text-slate-700">(expired)</span>}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2" title={w.reason}>
                        {w.reason}
                      </td>
                      <td className="px-3 py-2">
                        {w.doc_url ? (
                          <a
                            href={w.doc_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
                          >
                            <ExternalLink className="h-3 w-3" />
                            open
                          </a>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeWarning(w.id)}
                          disabled={isSaving}
                          className="text-slate-600 transition hover:text-rose-400 disabled:opacity-50"
                          title="Delete warning (owner only)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {warningsError && <p className="text-[11px] text-rose-400">{warningsError}</p>}
      </section>

      {modalOpen && (
        <WarningModal
          staff={rostered}
          isSaving={isSaving}
          onClose={() => setModalOpen(false)}
          onSubmit={async (payload) => {
            const ok = await addWarning(payload)
            if (ok) setModalOpen(false)
          }}
        />
      )}
    </div>
  )
}

interface WarningModalProps {
  staff: { id: string; name: string }[]
  isSaving: boolean
  onClose: () => void
  onSubmit: (payload: {
    staff_id: string
    kind: WarningKind
    reason: string
    issued_on: string
    doc_url: string | null
  }) => void
}

function WarningModal({ staff, isSaving, onClose, onSubmit }: WarningModalProps) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '')
  const [kind, setKind] = useState<WarningKind>('written_1')
  const [reason, setReason] = useState('Repeated lateness (LEG-004 §5)')
  const [issuedOn, setIssuedOn] = useState(new Date().toISOString().slice(0, 10))
  const [docUrl, setDocUrl] = useState('')

  const canSubmit = staffId && reason.trim().length > 0 && !isSaving

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-slate-900 p-4 shadow-2xl ring-1 ring-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Log a warning</h3>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <label className="block">
            <span className="mb-1 block text-slate-400">Staff</span>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-slate-200 ring-1 ring-slate-700"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-400">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as WarningKind)}
              className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-slate-200 ring-1 ring-slate-700"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {WARNING_KIND_META[k].label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-400">Date of violation</span>
            <input
              type="date"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
              className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-slate-200 ring-1 ring-slate-700"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-slate-200 ring-1 ring-slate-700"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-400">Signed document link (optional)</span>
            <input
              type="url"
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-slate-200 ring-1 ring-slate-700"
            />
          </label>

          <p className="text-[10px] text-slate-600">
            A written warning must be signed by the employee (or witnessed if they refuse) to hold up
            under LPA §119(4). File the signed copy and paste its link here.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                staff_id: staffId,
                kind,
                reason: reason.trim(),
                issued_on: issuedOn,
                doc_url: docUrl.trim() || null,
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save warning
          </button>
        </div>
      </div>
    </div>
  )
}

export default PunctualityPage
