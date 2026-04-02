import { useState, useCallback, useEffect } from 'react'
import { Clock, Calculator, Save, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRecipeSteps, type RecipeStep } from '../../hooks/useRecipeSteps'
import { backwardSchedule, detectConflicts, type ScheduledStep } from '../../lib/backwardSchedule'
import { DishSelector, type SelectedDish } from './DishSelector'
import { BackwardGantt, type EquipmentLocation } from './BackwardGantt'
import { ConflictBadge } from './ConflictBadge'

export function BackwardScheduler() {
  const { fetchSteps } = useRecipeSteps()

  const [dishes, setDishes] = useState<SelectedDish[]>([])
  const [deadlineDate, setDeadlineDate] = useState(() => new Date().toISOString().split('T')[0])
  const [deadlineTime, setDeadlineTime] = useState('12:00')
  const [scheduledSteps, setScheduledSteps] = useState<ScheduledStep[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)

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

  const conflictCount = scheduledSteps.filter((s) => s.has_conflict).length

  const calculate = useCallback(async () => {
    if (dishes.length === 0) return
    setIsCalculating(true)
    setSaveResult(null)

    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)
    const allSteps: ScheduledStep[] = []

    for (const dish of dishes) {
      // Fetch steps using nomenclature UUID
      const steps: RecipeStep[] = await fetchSteps(dish.id)
      if (steps.length === 0) continue

      const scheduled = backwardSchedule(steps, deadline, dish.id, dish.product_code, dish.name)
      allSteps.push(...scheduled)
    }

    detectConflicts(allSteps)
    setScheduledSteps(allSteps)
    setIsCalculating(false)
  }, [dishes, deadlineDate, deadlineTime, fetchSteps])

  const saveToProduction = useCallback(async () => {
    if (scheduledSteps.length === 0) return
    setIsSaving(true)
    setSaveResult(null)

    let created = 0
    for (const s of scheduledSteps) {
      const { error } = await supabase.from('production_tasks').insert({
        target_nomenclature_id: s.nomenclature_id,
        description: `${s.dish_name} — ${s.step.operation_name}`,
        scheduled_start: s.scheduled_start.toISOString(),
        duration_min: s.step.duration_min,
        equipment_id: s.equipment_id,
        status: 'scheduled',
      })

      if (!error) created++
    }

    setSaveResult(`Created ${created} tasks in schedule`)
    setIsSaving(false)
  }, [scheduledSteps])

  // Compute earliest start for info
  const earliestStart = scheduledSteps.length > 0
    ? new Date(Math.min(...scheduledSteps.map((s) => s.scheduled_start.getTime())))
    : null

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Backward Scheduler</h1>
        <p className="text-xs text-slate-500">
          Backward scheduling — set a deadline and select dishes
        </p>
      </div>

      {/* Deadline + dishes */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs text-slate-400">
              <Clock className="mr-1 inline h-3 w-3" />
              Deadline (date)
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs text-slate-400">Time</label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Dishes</label>
          <DishSelector dishes={dishes} onChange={setDishes} />
        </div>

        <div className="flex items-center gap-3">
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
              Save to Schedule
            </button>

            {saveResult && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <Check className="h-4 w-4" />
                {saveResult}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tasks will be created in production_tasks and appear on the KDS Gantt chart
          </p>
        </div>
      )}
    </div>
  )
}
