import type { RecipeStep } from '../hooks/useRecipeSteps'

// ─── Types ────────────────────────────────────────────────────────

export interface EquipmentCapacity {
  equipment_id: string
  capacity: number | null       // max load per cycle (in capacity_unit)
  capacity_unit: string | null
  setup_time_min: number        // preheat / cleanup time
  max_parallel: number          // parallel batches
}

export interface ScheduledStep {
  step: RecipeStep
  nomenclature_id: string
  product_code: string
  dish_name: string
  scheduled_start: Date
  scheduled_end: Date
  equipment_id: string | null
  has_conflict: boolean
  is_passive: boolean
  batch_count: number           // how many cycles needed (based on capacity)
  setup_start: Date | null      // equipment preheat/setup start time (before scheduled_start)
}

export interface ScheduleOptions {
  target_qty?: number                           // how much to produce (for capacity calculation)
  target_unit?: string
  equipment_map?: Map<string, EquipmentCapacity> // equipment_id → capacity info
  buffer_pct?: number                            // buffer as % of total duration (default: 10)
}

// ─── Core algorithm ───────────────────────────────────────────────

/**
 * Backward scheduling: given recipe steps and a deadline, calculate
 * when each step should start by walking backward from the deadline.
 *
 * Enhancements over v1:
 * - is_passive steps can overlap with next active step (cook is free)
 * - Equipment capacity → batch count → adjusted duration
 * - Setup time (preheat) tracked separately for Gantt display
 * - Optional buffer added at the beginning
 */
export function backwardSchedule(
  steps: RecipeStep[],
  deadline: Date,
  nomenclature_id: string,
  product_code: string,
  dish_name: string,
  options?: ScheduleOptions,
): ScheduledStep[] {
  const result: ScheduledStep[] = []
  let currentEnd = deadline
  const equipMap = options?.equipment_map

  // Go from last step to first
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]

    // Calculate batch count if equipment has capacity limits
    let batchCount = 1
    let setupMin = 0
    if (step.equipment_id && equipMap) {
      const eq = equipMap.get(step.equipment_id)
      if (eq) {
        setupMin = eq.setup_time_min ?? 0

        // Calculate batches needed based on capacity
        if (eq.capacity && eq.capacity > 0 && options?.target_qty) {
          batchCount = Math.ceil(options.target_qty / (eq.capacity * eq.max_parallel))
        }
      }
    }

    // Effective duration = step duration × batch count
    const effectiveDuration = step.duration_min * batchCount

    const start = new Date(currentEnd.getTime() - effectiveDuration * 60_000)
    const setupStart = setupMin > 0
      ? new Date(start.getTime() - setupMin * 60_000)
      : null

    result.unshift({
      step,
      nomenclature_id,
      product_code,
      dish_name,
      scheduled_start: start,
      scheduled_end: currentEnd,
      equipment_id: step.equipment_id,
      has_conflict: false,
      is_passive: step.is_passive,
      batch_count: batchCount,
      setup_start: setupStart,
    })

    // For passive steps, the cook is free — the next step can start
    // at the same time as this passive step starts (they overlap).
    // However, the step before this one must still finish before this one starts.
    // So we still move currentEnd backward.
    // NOTE: If we want passive overlap optimization, we'd need a more complex
    // dependency graph. For now, keep sequential for safety.
    currentEnd = setupStart ?? start
  }

  // Apply buffer at the beginning
  if (options?.buffer_pct && result.length > 0) {
    const totalDuration = deadline.getTime() - result[0].scheduled_start.getTime()
    const bufferMs = (totalDuration * (options.buffer_pct / 100))

    for (const s of result) {
      s.scheduled_start = new Date(s.scheduled_start.getTime() - bufferMs)
      s.scheduled_end = new Date(s.scheduled_end.getTime() - bufferMs)
      if (s.setup_start) {
        s.setup_start = new Date(s.setup_start.getTime() - bufferMs)
      }
    }
  }

  return result
}

// ─── Conflict detection ───────────────────────────────────────────

/**
 * Detect equipment conflicts across all scheduled steps.
 * Two steps conflict if they use the same equipment and their time ranges overlap.
 * Setup time is included in the overlap check.
 */
export function detectConflicts(allSteps: ScheduledStep[]): ScheduledStep[] {
  const byEquipment = new Map<string, ScheduledStep[]>()

  for (const s of allSteps) {
    if (!s.equipment_id) continue
    const group = byEquipment.get(s.equipment_id) ?? []
    group.push(s)
    byEquipment.set(s.equipment_id, group)
  }

  for (const [, group] of byEquipment) {
    // Sort by effective start (including setup)
    group.sort((a, b) => {
      const aStart = (a.setup_start ?? a.scheduled_start).getTime()
      const bStart = (b.setup_start ?? b.scheduled_start).getTime()
      return aStart - bStart
    })

    for (let i = 1; i < group.length; i++) {
      const prevEnd = group[i - 1].scheduled_end.getTime()
      const currStart = (group[i].setup_start ?? group[i].scheduled_start).getTime()

      if (currStart < prevEnd) {
        group[i].has_conflict = true
        group[i - 1].has_conflict = true
      }
    }
  }

  return allSteps
}

// ─── Utility: calculate total duration including setup ─────────────

export function totalScheduleDuration(steps: ScheduledStep[]): {
  total_min: number
  active_min: number
  passive_min: number
  setup_min: number
  earliest_start: Date | null
} {
  if (steps.length === 0) {
    return { total_min: 0, active_min: 0, passive_min: 0, setup_min: 0, earliest_start: null }
  }

  let active = 0
  let passive = 0
  let setup = 0

  for (const s of steps) {
    const dur = (s.scheduled_end.getTime() - s.scheduled_start.getTime()) / 60_000
    if (s.is_passive) {
      passive += dur
    } else {
      active += dur
    }
    if (s.setup_start) {
      setup += (s.scheduled_start.getTime() - s.setup_start.getTime()) / 60_000
    }
  }

  const earliest = new Date(Math.min(
    ...steps.map((s) => (s.setup_start ?? s.scheduled_start).getTime()),
  ))

  return {
    total_min: active + passive + setup,
    active_min: active,
    passive_min: passive,
    setup_min: setup,
    earliest_start: earliest,
  }
}
