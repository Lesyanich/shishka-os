import { useState, useMemo } from 'react'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { useStaff } from '../../hooks/useStaff'
import { useShifts } from '../../hooks/useShifts'

type Template = '5_2' | '2_2' | '6_1' | 'every_day' | 'custom'

const TEMPLATES: { id: Template; label: string; description: string }[] = [
  { id: 'every_day', label: 'Every Day', description: 'Shift every day of the period' },
  { id: '6_1', label: '6/1', description: '6 working days, 1 day off' },
  { id: '5_2', label: '5/2', description: '5 working days, 2 days off' },
  { id: '2_2', label: '2/2', description: '2 on, 2 off' },
  { id: 'custom', label: 'Custom', description: 'Custom work/off pattern' },
]

function generateDates(
  start: string,
  end: string,
  template: Template,
  customWorkDays: number,
  customOffDays: number,
): string[] {
  const dates: string[] = []
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  let dayIndex = 0

  // Resolve work/off cycle
  let workDays: number
  let cycleDays: number
  if (template === '5_2') { workDays = 5; cycleDays = 7 }
  else if (template === '2_2') { workDays = 2; cycleDays = 4 }
  else if (template === '6_1') { workDays = 6; cycleDays = 7 }
  else if (template === 'custom') { workDays = customWorkDays; cycleDays = customWorkDays + customOffDays }
  else { workDays = 1; cycleDays = 1 } // every_day

  while (s <= e) {
    const isWork = cycleDays > 0 ? (dayIndex % cycleDays) < workDays : true
    if (isWork) {
      dates.push(s.toISOString().split('T')[0])
    }
    s.setDate(s.getDate() + 1)
    dayIndex++
  }
  return dates
}

export function BulkScheduleGenerator() {
  const { staff } = useStaff()
  const { createShift } = useShifts()

  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? 1 : 8 - day // next Monday
    d.setDate(d.getDate() + diff)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = day === 0 ? 7 : 14 - day // next Sunday
    d.setDate(d.getDate() + diff)
    return d.toISOString().split('T')[0]
  })
  const [template, setTemplate] = useState<Template>('every_day')
  const [customWorkDays, setCustomWorkDays] = useState(5)
  const [customOffDays, setCustomOffDays] = useState(2)
  const [shiftStart, setShiftStart] = useState('08:00')
  const [shiftEnd, setShiftEnd] = useState('16:00')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const activeStaff = staff.filter((s) => s.is_active)

  const previewDates = useMemo(
    () => generateDates(startDate, endDate, template, customWorkDays, customOffDays),
    [startDate, endDate, template, customWorkDays, customOffDays],
  )

  const totalShifts = previewDates.length * selectedStaff.length

  function toggleStaff(id: string) {
    setSelectedStaff((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function selectAll() {
    setSelectedStaff(activeStaff.map((s) => s.id))
  }

  function selectNone() {
    setSelectedStaff([])
  }

  async function handleGenerate() {
    if (selectedStaff.length === 0 || previewDates.length === 0) return
    setGenerating(true)
    setResult(null)

    let created = 0
    for (const staffId of selectedStaff) {
      for (const date of previewDates) {
        const res = await createShift({
          staff_id: staffId,
          shift_date: date,
          start_time: shiftStart,
          end_time: shiftEnd,
        })
        if (res) created++
      }
    }

    setResult(`Created ${created} shifts`)
    setGenerating(false)
  }

  return (
    <div className="space-y-4">
      {/* Staff selection */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Staff</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              All
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeStaff.map((s) => {
            const selected = selectedStaff.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStaff(s.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {s.name}
              </button>
            )
          })}
          {activeStaff.length === 0 && (
            <p className="text-xs text-slate-500">No active staff members</p>
          )}
        </div>
      </div>

      {/* Period + template */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Period & Template</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-400">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-400">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-400">Shift Start</label>
            <input
              type="time"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-400">Shift End</label>
            <input
              type="time"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Template</label>
          <div className="flex gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                  template === t.id
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title={t.description}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Custom pattern controls */}
          {template === 'custom' && (
            <div className="mt-3 flex gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-slate-400">Work days</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={7}
                    value={customWorkDays}
                    onChange={(e) => setCustomWorkDays(parseInt(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="w-6 text-center text-sm font-bold text-emerald-300">{customWorkDays}</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-slate-400">Off days</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={6}
                    value={customOffDays}
                    onChange={(e) => setCustomOffDays(parseInt(e.target.value))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="w-6 text-center text-sm font-bold text-amber-300">{customOffDays}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-2 text-sm font-medium text-slate-300">Preview</h3>
        <p className="text-xs text-slate-400">
          Working days: <span className="text-slate-100">{previewDates.length}</span> ·
          Staff: <span className="text-slate-100">{selectedStaff.length}</span> ·
          Total shifts: <span className="text-emerald-400 font-medium">{totalShifts}</span>
        </p>
        {previewDates.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {previewDates.slice(0, 21).map((d) => (
              <span key={d} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                {d.slice(5)}
              </span>
            ))}
            {previewDates.length > 21 && (
              <span className="text-[10px] text-slate-600">+{previewDates.length - 21}</span>
            )}
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || selectedStaff.length === 0 || previewDates.length === 0}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="h-4 w-4" />
          )}
          Create {totalShifts} shifts
        </button>
        {result && (
          <span className="text-sm text-emerald-400">{result}</span>
        )}
      </div>
    </div>
  )
}
