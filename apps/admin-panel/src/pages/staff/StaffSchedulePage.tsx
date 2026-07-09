import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Play,
  Square,
} from 'lucide-react'
import { useAppRole } from '../../contexts/AppRoleContext'
import { useShiftClock, useWeekSchedule } from '../../hooks/useShiftClock'
import { useAttendanceRange } from '../../hooks/useAttendanceRange'
import { attendanceMeta, attendanceMetaGeneric, isNonWorkingStatus } from '../../lib/attendanceStatus'
import { formatTime, getWeekDays, shiftFor } from '../../lib/staffSchedule'

export function StaffSchedulePage() {
  const { staffId, staffName, isLoading: roleLoading } = useAppRole()
  const [weekOffset, setWeekOffset] = useState(0)

  const weekDays = useMemo(() => {
    const ref = new Date()
    ref.setDate(ref.getDate() + weekOffset * 7)
    return getWeekDays(ref)
  }, [weekOffset])

  const weekStart = weekDays[0].iso
  const weekEnd = weekDays[6].iso

  const { isClockedIn, lastEvent, todayEvents, isLoading: clockLoading, isSaving, error: clockError, clock } =
    useShiftClock(staffId)
  const { roster, shifts, isLoading: weekLoading, error: weekError } = useWeekSchedule(weekStart, weekEnd)
  const { attendanceByKey } = useAttendanceRange(weekStart, weekEnd)

  const weekLabel = `${weekDays[0].dayNum} – ${weekDays[6].dayNum}`

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-emerald-400" />
        <div>
          <h1 className="text-lg font-semibold text-slate-100">My Schedule</h1>
          <p className="text-xs text-slate-500">
            {staffName ? `Signed in as ${staffName}` : 'Shifts and shift clock-in'}
          </p>
        </div>
      </header>

      {/* ── Clock-in / clock-out card ── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Clock className="h-4 w-4" /> Shift clock
        </div>

        {roleLoading || clockLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !staffId ? (
          <div className="flex items-start gap-3 rounded-lg bg-amber-950/40 p-4 text-sm text-amber-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Your login isn’t linked to a staff profile yet, so you can’t clock in. Ask the owner to
              link your account.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
                  isClockedIn ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-2 w-2 rounded-full',
                    isClockedIn ? 'bg-emerald-400' : 'bg-slate-500',
                  ].join(' ')}
                />
                {isClockedIn
                  ? `On shift since ${formatTime(lastEvent?.event_at ?? null)}`
                  : 'Not on shift'}
              </div>

              {todayEvents.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {todayEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-emerald-500" />
                      {e.event_type === 'clock_in' ? 'Clocked in' : 'Clocked out'} at{' '}
                      {formatTime(e.event_at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => clock(isClockedIn ? 'clock_out' : 'clock_in')}
              className={[
                'inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition disabled:opacity-50',
                isClockedIn
                  ? 'bg-rose-500/90 text-white hover:bg-rose-500'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
              ].join(' ')}
            >
              {isSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isClockedIn ? (
                <Square className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
              {isClockedIn ? 'End shift' : 'Start shift'}
            </button>
          </div>
        )}

        {clockError && <p className="mt-3 text-xs text-rose-400">{clockError}</p>}
      </section>

      {/* ── Week schedule: my shifts + colleagues' days off ── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <CalendarDays className="h-4 w-4" /> Week {weekLabel}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {weekLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
          </div>
        ) : weekError ? (
          <p className="py-4 text-sm text-rose-400">{weekError}</p>
        ) : roster.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No active staff.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-slate-900/60 px-2 py-2 text-left text-xs font-medium text-slate-500">
                    Staff
                  </th>
                  {weekDays.map((d) => (
                    <th
                      key={d.iso}
                      className={[
                        'px-2 py-2 text-center text-xs font-medium',
                        d.isToday ? 'text-emerald-300' : 'text-slate-500',
                      ].join(' ')}
                    >
                      <div>{d.label}</div>
                      <div className="text-[10px] opacity-70">{d.dayNum}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((member) => {
                  const isMe = member.id === staffId
                  return (
                    <tr key={member.id} className="border-t border-slate-800/70">
                      <td
                        className={[
                          'sticky left-0 bg-slate-900/60 px-2 py-2 text-left font-medium',
                          isMe ? 'text-emerald-300' : 'text-slate-300',
                        ].join(' ')}
                      >
                        {member.name}
                        {isMe && <span className="ml-1 text-[10px] text-emerald-500">(you)</span>}
                      </td>
                      {weekDays.map((d) => {
                        const shift = shiftFor(shifts, member.id, d.iso)
                        const attStatus = attendanceByKey.get(`${member.id}|${d.iso}`)
                        // Own row shows the specific status; colleagues show a
                        // generic "Off" so a leave reason isn't broadcast.
                        const override = isNonWorkingStatus(attStatus)
                          ? isMe
                            ? attendanceMeta(attStatus)
                            : attendanceMetaGeneric(attStatus)
                          : null
                        return (
                          <td key={d.iso} className="px-2 py-2 text-center">
                            {override ? (
                              <span
                                className={`inline-block rounded-md px-2 py-1 text-xs ${override.badge}`}
                                title={isMe ? override.label : undefined}
                              >
                                {override.short}
                              </span>
                            ) : shift ? (
                              <span
                                className={[
                                  'inline-block rounded-md px-2 py-1 text-xs',
                                  isMe
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-slate-800 text-slate-300',
                                ].join(' ')}
                              >
                                {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-600">Off</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
