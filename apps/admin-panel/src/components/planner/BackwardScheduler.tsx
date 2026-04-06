import { useState, useCallback, useEffect } from 'react'
import { Clock, Calculator, Save, Loader2, Check, AlertTriangle, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRecipeSteps, type RecipeStep } from '../../hooks/useRecipeSteps'
import { backwardScheduleWithResult, detectConflicts, type ScheduledStep, type ScheduleResult } from '../../lib/backwardSchedule'
import { DishSelector, type SelectedDish } from './DishSelector'
import { BackwardGantt, type EquipmentLocation } from './BackwardGantt'
import { ConflictBadge } from './ConflictBadge'

// ─── Staff types ────────────────────────────────────────────────

interface StaffMember {
  id: string
  name: string
  skill_level: number
  is_on_shift: boolean
}

interface TaskAssignment {
  nomenclature_id: string
  dish_name: string
  assigned_to: string | null
  required_skill: number
}

type SkillMatch = 'good' | 'stretch' | 'none'

function getSkillMatch(staffSkill: number, requiredSkill: number): SkillMatch {
  if (staffSkill > requiredSkill) return 'good'
  if (staffSkill === requiredSkill) return 'stretch'
  return 'none'
}

const SKILL_COLORS: Record<SkillMatch, string> = {
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  stretch: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  none: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
}

// ─── Component ──────────────────────────────────────────────────

export function BackwardScheduler() {
  const { fetchSteps } = useRecipeSteps()

  // Schedule config
  const [dishes, setDishes] = useState<SelectedDish[]>([])
  const [deadlineDate, setDeadlineDate] = useState(() => new Date().toISOString().split('T')[0])
  const [deadlineTime, setDeadlineTime] = useState('12:00')
  const [shiftStart, setShiftStart] = useState('07:00')

  // Schedule result
  const [scheduledSteps, setScheduledSteps] = useState<ScheduledStep[]>([])
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)

  // Staff assignment
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [assignments, setAssignments] = useState<TaskAssignment[]>([])
  const [showAssignment, setShowAssignment] = useState(false)

  // Save
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)

  // Equipment locations
  const [eqLocations, setEqLocations] = useState<Map<string, EquipmentLocation>>(new Map())

  // Fetch equipment locations once
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, location_zone, location_wall')
        .not('location_zone', 'is', null)
      if (data) {
        const map = new Map<string, EquipmentLocation>()
        for (const row of data) {
          map.set(row.id as string, {
            zone: row.location_zone as string | null,
            wall: row.location_wall as string | null,
          })
        }
        setEqLocations(map)
      }
    })()
  }, [])

  // Fetch staff for assignment
  useEffect(() => {
    ;(async () => {
      // Get active staff with skill level
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name, skill_level')
        .eq('is_active', true)
        .in('role', ['cook', 'sous_chef', 'prep'])
        .order('skill_level', { ascending: false })

      // Get today's shifts
      const today = deadlineDate
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('staff_id')
        .eq('shift_date', today)
        .in('status', ['scheduled', 'confirmed', 'in_progress'])

      const onShift = new Set((shiftData ?? []).map(s => s.staff_id))

      setStaff((staffData ?? []).map(s => ({
        id: s.id,
        name: s.name,
        skill_level: s.skill_level ?? 1,
        is_on_shift: onShift.has(s.id),
      })))
    })()
  }, [deadlineDate])

  const conflictCount = scheduledSteps.filter((s) => s.has_conflict).length

  // ─── Calculate schedule ───────────────────────────────────────
  const calculate = useCallback(async () => {
    if (dishes.length === 0) return
    setIsCalculating(true)
    setSaveResult(null)
    setShowAssignment(false)

    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)
    const [shiftH, shiftM] = shiftStart.split(':').map(Number)
    const allSteps: ScheduledStep[] = []
    let anyBeforeShift = false
    let shiftStartTime: Date | null = null

    for (const dish of dishes) {
      const steps: RecipeStep[] = await fetchSteps(dish.id)
      if (steps.length === 0) continue

      const result = backwardScheduleWithResult(steps, deadline, dish.id, dish.product_code, dish.name, {
        target_qty: dish.qty,
        shift_start_hour: shiftH,
        shift_start_minute: shiftM,
      })
      allSteps.push(...result.steps)
      if (result.before_shift_start) anyBeforeShift = true
      if (result.shift_start_time) shiftStartTime = result.shift_start_time
    }

    detectConflicts(allSteps)
    setScheduledSteps(allSteps)
    setScheduleResult({
      steps: allSteps,
      earliest_start: allSteps.length > 0
        ? new Date(Math.min(...allSteps.map(s => (s.setup_start ?? s.scheduled_start).getTime())))
        : null,
      before_shift_start: anyBeforeShift,
      shift_start_time: shiftStartTime,
    })

    // Build assignment suggestions per dish
    const dishAssignments: TaskAssignment[] = []
    const dishGroups = new Map<string, { name: string; maxSkill: number }>()

    for (const s of allSteps) {
      const existing = dishGroups.get(s.nomenclature_id)
      const stepSkill = (s.step as RecipeStep & { min_skill_level?: number }).min_skill_level ?? 1
      if (!existing) {
        dishGroups.set(s.nomenclature_id, { name: s.dish_name, maxSkill: stepSkill })
      } else {
        existing.maxSkill = Math.max(existing.maxSkill, stepSkill)
      }
    }

    // Auto-assign: best available staff per dish
    const usedStaff = new Set<string>()
    for (const [nomId, info] of dishGroups) {
      const available = staff
        .filter(s => s.is_on_shift && s.skill_level >= info.maxSkill && !usedStaff.has(s.id))
        .sort((a, b) => a.skill_level - b.skill_level) // lowest sufficient skill first

      const assigned = available[0] ?? null
      if (assigned) usedStaff.add(assigned.id)

      dishAssignments.push({
        nomenclature_id: nomId,
        dish_name: info.name,
        assigned_to: assigned?.id ?? null,
        required_skill: info.maxSkill,
      })
    }

    setAssignments(dishAssignments)
    setIsCalculating(false)
  }, [dishes, deadlineDate, deadlineTime, shiftStart, fetchSteps, staff])

  // ─── Save to production ───────────────────────────────────────
  const saveToProduction = useCallback(async () => {
    if (scheduledSteps.length === 0) return
    setIsSaving(true)
    setSaveResult(null)

    // Build assignment map: nomenclature_id → staff_id
    const assignMap = new Map(assignments.map(a => [a.nomenclature_id, a.assigned_to]))

    let created = 0
    for (const s of scheduledSteps) {
      const { error } = await supabase.from('production_tasks').insert({
        target_nomenclature_id: s.nomenclature_id,
        target_quantity: dishes.find(d => d.id === s.nomenclature_id)?.qty ?? null,
        description: `${s.dish_name} — ${s.step.operation_name}`,
        scheduled_start: s.scheduled_start.toISOString(),
        duration_min: s.step.duration_min,
        equipment_id: s.equipment_id,
        assigned_to: assignMap.get(s.nomenclature_id) ?? null,
        status: 'pending',
      })
      if (!error) created++
    }

    setSaveResult(`Created ${created} tasks`)
    setIsSaving(false)
  }, [scheduledSteps, assignments, dishes])

  // ─── Render ───────────────────────────────────────────────────
  const earliestStart = scheduleResult?.earliest_start ?? null

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Production Planner</h1>
        <p className="text-xs text-slate-500">
          Set deadline, select dishes, assign to cooks
        </p>
      </div>

      {/* Deadline + shift start + dishes */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs text-slate-400">
              <Clock className="mr-1 inline h-3 w-3" />
              Deadline date
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs text-slate-400">Deadline time</label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs text-slate-400">Shift start</label>
            <input
              type="time"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Dishes</label>
          <DishSelector dishes={dishes} onChange={setDishes} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={calculate}
            disabled={isCalculating || dishes.length === 0}
            className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {isCalculating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Calculator className="mr-2 h-4 w-4" />
            )}
            Calculate Schedule
          </button>

          {earliestStart && (
            <span className="text-xs text-slate-400">
              Start: {earliestStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {' · '}
              {scheduledSteps.length} steps
            </span>
          )}

          {conflictCount > 0 && <ConflictBadge count={conflictCount} />}
        </div>

        {/* Working hours warning */}
        {scheduleResult?.before_shift_start && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Schedule starts at{' '}
              <strong>
                {earliestStart?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </strong>
              , before shift start ({shiftStart}).
              Reduce items or set an earlier shift start.
            </span>
          </div>
        )}
      </div>

      {/* Gantt */}
      {scheduledSteps.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Gantt Chart
          </h2>
          <BackwardGantt steps={scheduledSteps} equipmentLocations={eqLocations} />
        </div>
      )}

      {/* Staff Assignment */}
      {scheduledSteps.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Users className="h-4 w-4 text-sky-400" />
              Staff Assignment
            </h2>
            <button
              type="button"
              onClick={() => setShowAssignment(!showAssignment)}
              className="text-xs text-sky-400 hover:text-sky-300 transition"
            >
              {showAssignment ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {/* Compact view */}
          {!showAssignment && (
            <div className="flex flex-wrap gap-2">
              {assignments.map(a => {
                const assignedStaff = staff.find(s => s.id === a.assigned_to)
                return (
                  <div
                    key={a.nomenclature_id}
                    className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs"
                  >
                    <span className="text-slate-300">{a.dish_name}</span>
                    <span className="text-slate-600">&rarr;</span>
                    {assignedStaff ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        SKILL_COLORS[getSkillMatch(assignedStaff.skill_level, a.required_skill)]
                      }`}>
                        {assignedStaff.name}
                      </span>
                    ) : (
                      <span className="text-rose-400">Unassigned</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Expanded view */}
          {showAssignment && (
            <div className="space-y-3">
              {assignments.map((a, idx) => (
                <div key={a.nomenclature_id} className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">{a.dish_name}</span>
                    <span className="text-[10px] text-slate-500">
                      Min skill: L{a.required_skill}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Unassigned option */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...assignments]
                        next[idx] = { ...next[idx], assigned_to: null }
                        setAssignments(next)
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        !a.assigned_to
                          ? 'ring-1 ring-slate-500 bg-slate-700 text-slate-200'
                          : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      None
                    </button>
                    {staff.filter(s => s.is_on_shift).map(s => {
                      const match = getSkillMatch(s.skill_level, a.required_skill)
                      const isSelected = a.assigned_to === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            const next = [...assignments]
                            next[idx] = { ...next[idx], assigned_to: s.id }
                            setAssignments(next)
                          }}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            isSelected
                              ? SKILL_COLORS[match] + ' ring-1'
                              : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {s.name}
                          <span className="ml-1 text-[10px] opacity-60">L{s.skill_level}</span>
                        </button>
                      )
                    })}
                    {staff.filter(s => s.is_on_shift).length === 0 && (
                      <span className="text-xs text-slate-500">No staff on shift for {deadlineDate}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save */}
      {scheduledSteps.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveToProduction}
              disabled={isSaving}
              className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Confirm Plan
            </button>

            {saveResult && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <Check className="h-4 w-4" />
                {saveResult}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tasks will be assigned to cooks and appear on their My Tasks screen
          </p>
        </div>
      )}
    </div>
  )
}
