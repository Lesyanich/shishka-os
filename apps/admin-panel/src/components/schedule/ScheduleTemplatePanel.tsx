import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Loader2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLocations } from '../../hooks/useLocations'
import { useScheduleTemplates } from '../../hooks/useScheduleTemplates'
import { pad2 } from '../../lib/scheduleGen'

// Display order Mon..Sun, values are JS getDay() (0=Sun..6=Sat).
const WEEKDAYS = [
  { d: 1, label: 'Mon' },
  { d: 2, label: 'Tue' },
  { d: 3, label: 'Wed' },
  { d: 4, label: 'Thu' },
  { d: 5, label: 'Fri' },
  { d: 6, label: 'Sat' },
  { d: 0, label: 'Sun' },
]

interface EligibleStaff {
  id: string
  name: string
}

interface Draft {
  weekdays: number[]
  start: string
  end: string
  brk: number
  location: string | null
}

const DEFAULT_DRAFT: Draft = { weekdays: [0, 2, 3, 4, 5, 6], start: '08:00', end: '17:00', brk: 60, location: null }

export function ScheduleTemplatePanel() {
  const { locations } = useLocations()
  const { templates, saveTemplate, generateMonth } = useScheduleTemplates()

  const [staff, setStaff] = useState<EligibleStaff[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const now = new Date()
  const [ym, setYm] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)

  // Eligible = active staff with a salary (line staff); owners excluded — matches attendance filter.
  useEffect(() => {
    supabase
      .from('staff')
      .select('id, name')
      .eq('is_active', true)
      .not('monthly_salary', 'is', null)
      .order('name')
      .then(({ data }) => setStaff((data ?? []) as EligibleStaff[]))
  }, [])

  // Seed editable drafts from saved templates (or sensible default).
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const s of staff) {
      const t = templates.find((x) => x.staff_id === s.id)
      next[s.id] = t
        ? {
            weekdays: t.working_weekdays,
            start: t.start_time.slice(0, 5),
            end: t.end_time.slice(0, 5),
            brk: t.break_minutes,
            location: t.location_id,
          }
        : { ...DEFAULT_DRAFT }
    }
    setDrafts(next)
  }, [staff, templates])

  function toggleDay(staffId: string, day: number) {
    setDrafts((prev) => {
      const d = prev[staffId] ?? { ...DEFAULT_DRAFT }
      const has = d.weekdays.includes(day)
      const weekdays = has ? d.weekdays.filter((x) => x !== day) : [...d.weekdays, day].sort((a, b) => a - b)
      return { ...prev, [staffId]: { ...d, weekdays } }
    })
  }

  function patchDraft(staffId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [staffId]: { ...(prev[staffId] ?? DEFAULT_DRAFT), ...patch } }))
  }

  async function handleSave(staffId: string) {
    const d = drafts[staffId]
    if (!d) return
    setSavingId(staffId)
    await saveTemplate({
      staff_id: staffId,
      working_weekdays: d.weekdays,
      start_time: d.start,
      end_time: d.end,
      break_minutes: d.brk,
      location_id: d.location,
    })
    setSavingId(null)
  }

  async function handleGenerate() {
    const [y, m] = ym.split('-').map(Number)
    setGenerating(true)
    setGenResult(null)
    const res = await generateMonth(y, m)
    setGenResult(res.ok ? `Created ${res.created} shifts for ${ym}` : `Error: ${res.error}`)
    setGenerating(false)
  }

  const inputCls =
    'rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

  const hasTemplates = useMemo(() => templates.length > 0, [templates])

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Set each person's weekly pattern once, then generate any month from it. Generating clears
        only auto-planned (scheduled) shifts and skips public holidays.
      </p>

      {/* Per-staff template rows */}
      <div className="space-y-2">
        {staff.map((s) => {
          const d = drafts[s.id] ?? DEFAULT_DRAFT
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3"
            >
              <span className="w-20 shrink-0 text-sm font-medium text-slate-200">{s.name}</span>

              <div className="flex gap-1">
                {WEEKDAYS.map((w) => {
                  const on = d.weekdays.includes(w.d)
                  return (
                    <button
                      key={w.d}
                      type="button"
                      onClick={() => toggleDay(s.id, w.d)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        on
                          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                          : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                      }`}
                    >
                      {w.label}
                    </button>
                  )
                })}
              </div>

              <input
                type="time"
                value={d.start}
                onChange={(e) => patchDraft(s.id, { start: e.target.value })}
                className={inputCls}
              />
              <span className="text-slate-600">–</span>
              <input
                type="time"
                value={d.end}
                onChange={(e) => patchDraft(s.id, { end: e.target.value })}
                className={inputCls}
              />

              <label className="flex items-center gap-1 text-xs text-slate-400">
                break
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={d.brk}
                  onChange={(e) => patchDraft(s.id, { brk: parseInt(e.target.value) || 0 })}
                  className={`${inputCls} w-16`}
                />
                min
              </label>

              <select
                value={d.location ?? ''}
                onChange={(e) => patchDraft(s.id, { location: e.target.value || null })}
                className={inputCls}
              >
                <option value="">No location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleSave(s.id)}
                disabled={savingId === s.id}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                {savingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          )
        })}
        {staff.length === 0 && <p className="text-xs text-slate-500">No eligible staff (active with a salary).</p>}
      </div>

      {/* Generate month */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
        <label className="text-xs text-slate-400">Month</label>
        <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className={inputCls} />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !hasTemplates}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          title={hasTemplates ? '' : 'Save at least one template first'}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Generate Month
        </button>
        {genResult && <span className="text-sm text-emerald-400">{genResult}</span>}
      </div>
    </div>
  )
}

export default ScheduleTemplatePanel
