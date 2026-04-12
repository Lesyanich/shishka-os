import { useEffect, useMemo } from 'react'
import { Clock, Loader2, Pause, Play, Thermometer, Wrench } from 'lucide-react'
import { useRecipeSteps, type RecipeStep } from '../../hooks/useRecipeSteps'

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function StepRow({ step, isLast }: { step: RecipeStep; isLast: boolean }) {
  const hasTemp = step.temperature_c !== null || step.internal_temp_c !== null

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
            step.is_passive
              ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
              : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
          }`}
        >
          {step.step_order}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-slate-700" />
        )}
      </div>

      {/* Step content */}
      <div className={`mb-3 flex-1 rounded-lg border px-3 py-2 ${
        step.is_passive
          ? 'border-sky-500/20 bg-sky-500/5'
          : 'border-slate-700/50 bg-slate-800/30'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-100">
            {step.operation_name}
          </span>
          <div className="flex items-center gap-2">
            {step.is_passive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300">
                <Pause className="h-2.5 w-2.5" />
                Passive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                <Play className="h-2.5 w-2.5" />
                Active
              </span>
            )}
          </div>
        </div>

        {step.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {step.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(step.duration_min)}
          </span>

          {step.equipment_name && (
            <span className="inline-flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {step.equipment_name}
            </span>
          )}

          {hasTemp && (
            <span className="inline-flex items-center gap-1 text-rose-400">
              <Thermometer className="h-3 w-3" />
              {step.temperature_c !== null && `${step.temperature_c}°C`}
              {step.temperature_c !== null && step.internal_temp_c !== null && ' / '}
              {step.internal_temp_c !== null && `core ${step.internal_temp_c}°C`}
            </span>
          )}
        </div>

        {step.notes && (
          <p className="mt-1.5 text-[10px] italic text-slate-500">
            {step.notes}
          </p>
        )}
      </div>
    </div>
  )
}

export function ProcessTab({ nomenclatureId }: { nomenclatureId: string }) {
  const { steps, isLoading, error, fetchSteps } = useRecipeSteps()

  useEffect(() => {
    fetchSteps(nomenclatureId)
  }, [nomenclatureId, fetchSteps])

  const summary = useMemo(() => {
    if (steps.length === 0) return null

    const totalMin = steps.reduce((s, st) => s + st.duration_min, 0)
    const activeMin = steps.reduce((s, st) => s + (st.is_passive ? 0 : st.duration_min), 0)
    const passiveMin = totalMin - activeMin

    const equipmentSet = new Set<string>()
    for (const st of steps) {
      if (st.equipment_name) equipmentSet.add(st.equipment_name)
    }

    return { totalMin, activeMin, passiveMin, equipment: [...equipmentSet] }
  }, [steps])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading process steps...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-rose-400">
        Failed to load process: {error}
      </div>
    )
  }

  if (steps.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-slate-500">
        No process steps defined yet.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Summary header */}
      {summary && (
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-300">Total:</span>
              <span className="font-medium text-slate-100">
                {formatDuration(summary.totalMin)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Play className="h-3 w-3 text-amber-400" />
              <span className="text-slate-300">Active:</span>
              <span className="font-medium text-amber-200">
                {formatDuration(summary.activeMin)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Pause className="h-3 w-3 text-sky-400" />
              <span className="text-slate-300">Passive:</span>
              <span className="font-medium text-sky-200">
                {formatDuration(summary.passiveMin)}
              </span>
            </div>
          </div>
          {summary.equipment.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.equipment.map((eq) => (
                <span
                  key={eq}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                >
                  <Wrench className="h-2.5 w-2.5 text-slate-500" />
                  {eq}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>

      <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-500">
        {steps.length} steps
      </div>
    </div>
  )
}
