import { useState, useMemo } from 'react'
import { CalendarPlus, Clock, AlertTriangle, CalendarCog } from 'lucide-react'
import { useStaff } from '../../hooks/useStaff'
import { useShifts, type Shift } from '../../hooks/useShifts'
import { useLocations } from '../../hooks/useLocations'
import { toISODate } from '../../lib/staffSchedule'
import { WeekCalendar } from '../../components/schedule/WeekCalendar'
import { BulkScheduleGenerator } from '../../components/schedule/BulkScheduleGenerator'
import { ScheduleTemplatePanel } from '../../components/schedule/ScheduleTemplatePanel'

const LPA_MAX_HOURS_WEEK = 48
const LPA_MIN_DAYS_OFF = 1

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

function calcShiftHours(s: Shift): number {
  const [sh, sm] = s.start_time.split(':').map(Number)
  const [eh, em] = s.end_time.split(':').map(Number)
  const raw = (eh * 60 + em - sh * 60 - sm) / 60
  return Math.max(0, raw - (s.break_minutes ?? 0) / 60)
}

interface WeeklyStats {
  staffId: string
  staffName: string
  totalHours: number
  shiftCount: number
  daysWorked: number
  daysOff: number
  overHours: boolean
  noRestDay: boolean
}

export function SchedulePage() {
  const [showBulk, setShowBulk] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  const { staff } = useStaff()
  const { shifts, isLoading: shiftsLoading, createShift, updateShift, deleteShift } = useShifts()
  const { locations } = useLocations()

  // Owners (Bas, Lesia) are not on the roster — exclude them from the schedule grid.
  const activeStaff = useMemo(
    () => staff.filter((s) => s.is_active && s.app_role !== 'owner'),
    [staff],
  )

  // Calculate weekly stats per staff for the current week
  const weeklyStats = useMemo((): WeeklyStats[] => {
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDate(d)
    })

    return activeStaff.map((s) => {
      const weekShifts = shifts.filter(
        (sh) =>
          sh.staff_id === s.id &&
          weekDates.includes(sh.shift_date) &&
          (!locationFilter || sh.location_id === locationFilter),
      )

      const daysWithShift = new Set(weekShifts.map((sh) => sh.shift_date))
      const totalHours = weekShifts.reduce((sum, sh) => sum + calcShiftHours(sh), 0)
      const daysWorked = daysWithShift.size
      const daysOff = 7 - daysWorked

      return {
        staffId: s.id,
        staffName: s.name,
        totalHours: Math.round(totalHours * 10) / 10,
        shiftCount: weekShifts.length,
        daysWorked,
        daysOff,
        overHours: totalHours > LPA_MAX_HOURS_WEEK,
        noRestDay: daysOff < LPA_MIN_DAYS_OFF,
      }
    })
  }, [activeStaff, shifts, weekStart, locationFilter])

  const hasWarnings = weeklyStats.some((s) => s.overHours || s.noRestDay)

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Location filter */}
        <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
          <button
            type="button"
            onClick={() => setLocationFilter(null)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              locationFilter === null
                ? 'bg-emerald-500/15 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            All
          </button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => setLocationFilter(loc.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                locationFilter === loc.id
                  ? 'bg-emerald-500/15 text-emerald-300 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            showTemplates
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          }`}
        >
          <CalendarCog className="h-3.5 w-3.5" />
          Templates & Auto-Plan
        </button>

        <button
          type="button"
          onClick={() => setShowBulk(!showBulk)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            showBulk
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
          }`}
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Bulk Generate
        </button>
      </div>

      {/* Bulk generator (collapsible) */}
      {showTemplates && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <ScheduleTemplatePanel />
        </div>
      )}

      {showBulk && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
          <BulkScheduleGenerator />
        </div>
      )}

      {/* Week calendar */}
      <WeekCalendar
        shifts={shifts}
        shiftsLoading={shiftsLoading}
        createShift={createShift}
        updateShift={updateShift}
        deleteShift={deleteShift}
        locationFilter={locationFilter}
        onWeekChange={setWeekStart}
      />

      {/* Weekly hours summary */}
      {weeklyStats.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-300">Weekly Hours Summary</h3>
            {hasWarnings && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                LPA warning
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-3 py-1.5 text-left text-slate-500">Staff</th>
                  <th className="px-3 py-1.5 text-right text-slate-500">Shifts</th>
                  <th className="px-3 py-1.5 text-right text-slate-500">Days</th>
                  <th className="px-3 py-1.5 text-right text-slate-500">Hours</th>
                  <th className="px-3 py-1.5 text-right text-slate-500">Days Off</th>
                  <th className="px-3 py-1.5 text-center text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {weeklyStats.map((ws) => (
                  <tr key={ws.staffId} className="border-b border-slate-800/30">
                    <td className="px-3 py-1.5 text-slate-300">{ws.staffName}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{ws.shiftCount}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{ws.daysWorked}</td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium ${
                        ws.overHours ? 'text-rose-400' : 'text-slate-200'
                      }`}
                    >
                      {ws.totalHours}h
                      {ws.overHours && <span className="ml-1 text-rose-500">/ {LPA_MAX_HOURS_WEEK}</span>}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right ${
                        ws.noRestDay ? 'text-rose-400 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {ws.daysOff}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {ws.overHours || ws.noRestDay ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-400">
                          <AlertTriangle className="h-3 w-3" />
                          {ws.overHours && ws.noRestDay
                            ? 'Over hours + no rest'
                            : ws.overHours
                              ? `>${LPA_MAX_HOURS_WEEK}h`
                              : 'No rest day'}
                        </span>
                      ) : ws.shiftCount === 0 ? (
                        <span className="text-slate-600">No shifts</span>
                      ) : (
                        <span className="text-emerald-500">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SchedulePage
