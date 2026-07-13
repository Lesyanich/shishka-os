import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}
import { useStaff } from '../../hooks/useStaff'
import type { Shift, ShiftInsert, UseShiftsResult } from '../../hooks/useShifts'
import { useShiftTasks } from '../../hooks/useShiftTasks'
import { useEquipment } from '../../hooks/useEquipment'
import { supabase } from '../../lib/supabase'
import { toISODate } from '../../lib/staffSchedule'
import { attendanceMeta, isNonWorkingStatus } from '../../lib/attendanceStatus'
import { useAttendanceRange } from '../../hooks/useAttendanceRange'
import { ShiftEditor, } from './ShiftEditor'
import type { ShiftTaskDraft } from './ShiftTaskEditor'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// shift_date is a plain DATE — always derive it from local time, never
// toISOString(): UTC conversion shifts local-midnight dates back a day in ICT.
const formatDate = toISODate

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const ROLE_COLORS: Record<string, string> = {
  cook: 'bg-emerald-500/30 border-emerald-500/40 text-emerald-200',
  sous_chef: 'bg-sky-500/30 border-sky-500/40 text-sky-200',
  admin: 'bg-amber-500/30 border-amber-500/40 text-amber-200',
  dishwasher: 'bg-slate-500/30 border-slate-500/40 text-slate-300',
  prep: 'bg-violet-500/30 border-violet-500/40 text-violet-200',
  helper: 'bg-teal-500/30 border-teal-500/40 text-teal-200',
  cashier: 'bg-pink-500/30 border-pink-500/40 text-pink-200',
}

interface WeekCalendarProps {
  // Shift data + mutations are owned by the parent so the grid and the parent's
  // Weekly Hours Summary share a single useShifts() instance and stay in sync.
  shifts: Shift[]
  shiftsLoading: boolean
  createShift: UseShiftsResult['createShift']
  updateShift: UseShiftsResult['updateShift']
  deleteShift: UseShiftsResult['deleteShift']
  locationFilter?: string | null
  onWeekChange?: (weekStart: Date) => void
}

export function WeekCalendar({
  shifts: allShifts,
  shiftsLoading,
  createShift,
  updateShift,
  deleteShift,
  locationFilter = null,
  onWeekChange,
}: WeekCalendarProps) {
  const isMobile = useIsMobile()
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [mobileDay, setMobileDay] = useState(() => formatDate(new Date()))
  const [editorState, setEditorState] = useState<{
    shift?: Shift | null
    date: string
  } | null>(null)

  const { staff, isLoading: staffLoading } = useStaff()
  const { createShiftTask, deleteShiftTask } = useShiftTasks()
  const { equipment } = useEquipment()

  // Filter shifts by location if provided
  const shifts = useMemo(
    () => locationFilter ? allShifts.filter((s) => s.location_id === locationFilter) : allShifts,
    [allShifts, locationFilter],
  )

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })
  }, [weekStart])

  // Attendance overlay: a day-off / leave / absence marked in /hr/attendance
  // overrides a scheduled shift on this grid.
  const { attendanceByKey } = useAttendanceRange(weekDates[0], weekDates[6])

  const today = formatDate(new Date())
  // Owners (app_role='owner') are not rostered — keep them off the schedule grid.
  const activeStaff = staff.filter((s) => s.is_active && s.app_role !== 'owner')

  // Build a lookup: staffId -> date -> shifts
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const s of shifts) {
      const key = `${s.staff_id}|${s.shift_date}`
      const group = map.get(key) ?? []
      group.push(s)
      map.set(key, group)
    }
    return map
  }, [shifts])

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
    onWeekChange?.(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
    onWeekChange?.(d)
  }

  function goToday() {
    const d = getMonday(new Date())
    setWeekStart(d)
    onWeekChange?.(d)
  }

  function openCell(staffId: string, date: string) {
    const cellShifts = shiftMap.get(`${staffId}|${date}`)
    if (cellShifts && cellShifts.length > 0) {
      setEditorState({ shift: cellShifts[0], date })
    } else {
      setEditorState({ shift: null, date })
    }
  }

  const handleSave = useCallback(
    async (data: ShiftInsert, tasks: ShiftTaskDraft[]) => {
      let shiftId: string | undefined

      if (editorState?.shift) {
        const result = await updateShift(editorState.shift.id, data)
        shiftId = result?.id

        // Delete old tasks, recreate
        if (shiftId) {
          const { data: oldTasks } = await supabase
            .from('shift_tasks')
            .select('id')
            .eq('shift_id', shiftId)
          for (const t of oldTasks ?? []) {
            await deleteShiftTask(t.id as string)
          }
        }
      } else {
        const result = await createShift(data)
        shiftId = result?.id
      }

      if (shiftId && tasks.length > 0) {
        for (const t of tasks) {
          await createShiftTask({
            shift_id: shiftId,
            task_description: t.task_description || null,
            start_time: t.start_time,
            end_time: t.end_time,
            equipment_id: t.equipment_id,
            priority: t.priority,
          })
        }
      }
    },
    [editorState, createShift, updateShift, createShiftTask, deleteShiftTask],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteShift(id)
    },
    [deleteShift],
  )

  const isLoading = staffLoading || shiftsLoading

  const mobileDayLabel = useMemo(() => {
    const d = new Date(mobileDay + 'T00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }, [mobileDay])

  function prevMobileDay() {
    const d = new Date(mobileDay + 'T00:00')
    d.setDate(d.getDate() - 1)
    setMobileDay(formatDate(d))
  }

  function nextMobileDay() {
    const d = new Date(mobileDay + 'T00:00')
    d.setDate(d.getDate() + 1)
    setMobileDay(formatDate(d))
  }

  function goMobileToday() {
    setMobileDay(formatDate(new Date()))
  }

  return (
    <div>
      {/* Navigation — different for mobile vs desktop */}
      {isMobile ? (
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={prevMobileDay}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goMobileToday}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={nextMobileDay}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className={`ml-2 text-sm ${mobileDay === today ? 'text-emerald-400' : 'text-slate-400'}`}>
            {mobileDayLabel}
          </span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm text-slate-400">
            {formatShort(weekStart)} — {formatShort(new Date(weekStart.getTime() + 6 * 86400000))}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
          Loading...
        </div>
      ) : isMobile ? (
        /* Mobile: single-day card list */
        <div className="space-y-2">
          {activeStaff.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No active staff members</p>
          ) : (
            activeStaff.map((s) => {
              const cellShifts = shiftMap.get(`${s.id}|${mobileDay}`) ?? []
              const attStatus = attendanceByKey.get(`${s.id}|${mobileDay}`)
              const override = isNonWorkingStatus(attStatus) ? attendanceMeta(attStatus) : null
              return (
                <div
                  key={s.id}
                  onClick={() => openCell(s.id, mobileDay)}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 cursor-pointer hover:border-slate-700 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-500 capitalize">{s.role}</p>
                  </div>
                  {cellShifts.length > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      {cellShifts.map((sh) => (
                        <span
                          key={sh.id}
                          className={`rounded px-2 py-0.5 text-xs border ${ROLE_COLORS[s.role] ?? ROLE_COLORS.cook} ${override ? 'line-through opacity-40' : ''}`}
                        >
                          {sh.start_time.slice(0, 5)}–{sh.end_time.slice(0, 5)}
                          {sh.location && <span className="ml-1 opacity-70">{sh.location.name}</span>}
                        </span>
                      ))}
                      {override && (
                        <span className={`rounded px-2 py-0.5 text-xs ${override.badge}`} title={override.label}>
                          {override.short}
                        </span>
                      )}
                    </div>
                  ) : override ? (
                    <span className={`rounded px-2 py-0.5 text-xs ${override.badge}`} title={override.label}>
                      {override.short}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600">No shift</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* Desktop: week table */
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="px-3 py-2 text-left text-xs text-slate-400 w-28">Staff Member</th>
                {weekDates.map((date, i) => (
                  <th
                    key={date}
                    className={`px-2 py-2 text-center text-xs ${date === today ? 'text-emerald-400' : 'text-slate-400'}`}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-[10px]">{date.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No active staff members
                  </td>
                </tr>
              ) : (
                activeStaff.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/50">
                    <td className="px-3 py-2 text-xs font-medium text-slate-300 w-28 truncate">
                      {s.name}
                    </td>
                    {weekDates.map((date) => {
                      const cellShifts = shiftMap.get(`${s.id}|${date}`) ?? []
                      const isToday = date === today
                      const attStatus = attendanceByKey.get(`${s.id}|${date}`)
                      const override = isNonWorkingStatus(attStatus) ? attendanceMeta(attStatus) : null
                      return (
                        <td
                          key={date}
                          className={`px-1 py-1 cursor-pointer transition hover:bg-slate-800/50 ${isToday ? 'bg-emerald-500/5' : ''}`}
                          onClick={() => {
                            openCell(s.id, date)
                          }}
                        >
                          {cellShifts.length > 0 ? (
                            <>
                              {cellShifts.map((sh) => (
                                <div
                                  key={sh.id}
                                  className={`rounded px-1.5 py-1 text-[11px] border ${ROLE_COLORS[s.role] ?? ROLE_COLORS.cook} ${override ? 'line-through opacity-40' : ''}`}
                                >
                                  <div>{sh.start_time.slice(0, 5)}–{sh.end_time.slice(0, 5)}</div>
                                  {sh.location && (
                                    <div className="text-[9px] opacity-70 truncate">{sh.location.name}</div>
                                  )}
                                </div>
                              ))}
                              {override && (
                                <div className={`mt-1 rounded px-1 py-0.5 text-center text-[10px] ${override.badge}`} title={override.label}>
                                  {override.short}
                                </div>
                              )}
                            </>
                          ) : override ? (
                            <div className={`rounded px-1 py-1.5 text-center text-[10px] ${override.badge}`} title={override.label}>
                              {override.short}
                            </div>
                          ) : (
                            <div className="h-8 rounded border border-dashed border-slate-800 opacity-30" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Shift editor modal */}
      {editorState && (
        <ShiftEditor
          shift={editorState.shift}
          date={editorState.date}
          staffList={activeStaff}
          equipment={equipment}
          onSave={handleSave}
          onDelete={editorState.shift ? handleDelete : undefined}
          onClose={() => setEditorState(null)}
        />
      )}
    </div>
  )
}
