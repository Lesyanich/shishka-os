import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft, ChevronRight, CheckCircle2, Pause, Play,
  Thermometer, Target, Timer, ChevronDown, ChevronUp, Scale,
} from 'lucide-react'
import type { RecipeStep } from '../hooks/useRecipeSteps'
import type { ProductionTask } from '../types/tasks'
import { HACCPCheckpoint } from './HACCPCheckpoint'
import { useCook } from '../contexts/CookContext'
import { useHACCP } from '../hooks/useHACCP'

interface StepWizardProps {
  task: ProductionTask
  steps: RecipeStep[]
  onSetGrossWeight: (taskId: string, weight: number) => Promise<{ ok: boolean }>
  onComplete: () => void
}

export function StepWizard({ task, steps, onSetGrossWeight, onComplete }: StepWizardProps) {
  const { cook } = useCook()
  const { logCheckpoint, isCheckpointCompleted } = useHACCP()

  const [currentIdx, setCurrentIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [grossWeight, setGrossWeight] = useState(task.gross_weight?.toString() ?? '')
  const [grossSaved, setGrossSaved] = useState(task.gross_weight != null)
  const [haccpBusy, setHaccpBusy] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const step = steps[currentIdx]

  // Reset timer when step changes
  useEffect(() => {
    if (!step) return
    setSecondsLeft(step.duration_min * 60)
    setTimerRunning(false)
    setNotesOpen(false)
  }, [step?.id, step?.duration_min])

  // Timer tick
  useEffect(() => {
    if (timerRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { setTimerRunning(false); return 0 }
          return s - 1
        })
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunning, secondsLeft])

  const toggleTimer = useCallback(() => {
    if (!step) return
    if (secondsLeft === 0) {
      setSecondsLeft(step.duration_min * 60)
      setTimerRunning(true)
    } else {
      setTimerRunning(r => !r)
    }
  }, [secondsLeft, step])

  // Gross weight save (step 1)
  const handleSaveGross = useCallback(async () => {
    const w = parseFloat(grossWeight)
    if (isNaN(w) || w <= 0) return
    const result = await onSetGrossWeight(task.id, w)
    if (result.ok) setGrossSaved(true)
  }, [grossWeight, task.id, onSetGrossWeight])

  // HACCP confirm
  const handleHACCPConfirm = useCallback(async (actual: number | null, passed: boolean, notes?: string) => {
    if (!step || !cook) return
    setHaccpBusy(true)
    await logCheckpoint({
      taskId: task.id,
      flowId: step.id,
      stepOrder: step.step_order,
      type: step.haccp_type!,
      expected: step.haccp_target_value,
      tolerance: step.haccp_tolerance,
      actual,
      passed,
      staffId: cook.id,
      notes,
    })
    setHaccpBusy(false)
  }, [step, cook, task.id, logCheckpoint])

  // Navigation guards
  const isStep1 = currentIdx === 0
  const needsGrossWeight = isStep1 && !grossSaved
  const hasHACCP = step?.haccp_checkpoint && step.haccp_type
  const haccpDone = hasHACCP ? isCheckpointCompleted(step!.step_order) : true
  const canAdvance = !needsGrossWeight && haccpDone

  const goNext = () => {
    if (currentIdx < steps.length - 1) setCurrentIdx(i => i + 1)
    else onComplete()
  }

  if (!step) return null

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const timerPct = step.duration_min > 0
    ? ((step.duration_min * 60 - secondsLeft) / (step.duration_min * 60)) * 100
    : 0

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {/* Progress dots */}
      <div className="flex gap-1">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < currentIdx ? 'bg-emerald-500'
                : i === currentIdx ? 'bg-amber-500'
                : 'bg-slate-800'
            }`}
          />
        ))}
      </div>

      {/* Step card */}
      <div className={`rounded-xl border p-5 space-y-4 ${
        step.is_passive ? 'border-sky-500/30 bg-sky-500/5' : 'border-amber-500/30 bg-amber-500/5'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">
            STEP {currentIdx + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-slate-400" />
            <span className={`font-mono text-base font-bold ${
              secondsLeft === 0 ? 'text-emerald-400' : timerRunning ? 'text-amber-300' : 'text-slate-200'
            }`}>
              {timerStr}
            </span>
            <button type="button" onClick={toggleTimer}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition">
              {timerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${step.is_passive ? 'bg-sky-500/60' : 'bg-amber-500/60'}`}
            style={{ width: `${timerPct}%` }}
          />
        </div>

        {/* Operation name */}
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-wide">
            {step.operation_name}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            step.is_passive ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'
          }`}>
            {step.is_passive ? 'PASSIVE' : 'ACTIVE'}
          </span>
        </div>

        {/* Equipment */}
        {step.equipment_name && (
          <p className="text-sm text-slate-400">
            Equipment: <span className="text-slate-200">{step.equipment_name}</span>
          </p>
        )}

        {/* Instruction */}
        <div className="rounded-lg bg-slate-800/60 p-4">
          <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
            {step.description}
          </p>
        </div>

        {/* Temperature targets */}
        <div className="flex items-center gap-4 flex-wrap">
          {step.temperature_c != null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Thermometer className="h-4 w-4 text-red-400" />
              <span className="text-slate-400">Target:</span>
              <span className="font-semibold text-slate-100">{step.temperature_c}°C</span>
            </div>
          )}
          {step.internal_temp_c != null && (
            <div className="flex items-center gap-1.5 text-sm">
              <Target className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-400">Internal:</span>
              <span className="font-semibold text-emerald-300">{step.internal_temp_c}°C</span>
            </div>
          )}
        </div>

        {/* Passive step hint */}
        {step.is_passive && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-300">
            <span className="text-lg">💤</span>
            Passive step — you're free until the timer ends
          </div>
        )}

        {/* Chef notes */}
        {step.notes && (
          <div>
            <button type="button" onClick={() => setNotesOpen(!notesOpen)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition">
              Chef notes {notesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {notesOpen && (
              <p className="mt-1 rounded-lg bg-slate-800/40 p-2 text-xs text-slate-400 italic">
                {step.notes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Gross weight input (Step 1 only) */}
      {isStep1 && !grossSaved && (
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-400" />
            <h4 className="font-bold text-amber-300">Gross Weight (raw material)</h4>
          </div>
          <p className="text-xs text-slate-400">Weigh the raw material before processing. Required to proceed.</p>
          <input
            type="number"
            inputMode="decimal"
            value={grossWeight}
            onChange={e => setGrossWeight(e.target.value)}
            placeholder="0.00 kg"
            className="h-16 w-full rounded-xl border border-amber-500/30 bg-slate-900 px-4 text-center text-3xl font-bold text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={handleSaveGross}
            disabled={!grossWeight || isNaN(parseFloat(grossWeight)) || parseFloat(grossWeight) <= 0}
            className="w-full rounded-xl bg-amber-600 py-3 text-base font-bold text-white transition hover:bg-amber-500 disabled:opacity-40"
          >
            Save Gross Weight
          </button>
        </div>
      )}

      {isStep1 && grossSaved && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Gross weight: {task.gross_weight ?? grossWeight} kg
        </div>
      )}

      {/* HACCP Checkpoint */}
      {hasHACCP && !isCheckpointCompleted(step.step_order) && (
        <HACCPCheckpoint
          type={step.haccp_type!}
          expectedValue={step.haccp_target_value}
          tolerance={step.haccp_tolerance}
          onConfirm={handleHACCPConfirm}
          disabled={haccpBusy}
        />
      )}

      {hasHACCP && isCheckpointCompleted(step.step_order) && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          HACCP checkpoint recorded
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          className="flex items-center gap-1 rounded-lg px-4 py-3 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={!canAdvance}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white hover:bg-emerald-500 transition disabled:opacity-40"
        >
          <CheckCircle2 className="h-5 w-5" />
          {currentIdx >= steps.length - 1 ? 'FINISH STEPS' : 'NEXT'}
        </button>

        <button
          type="button"
          onClick={() => setCurrentIdx(i => Math.min(steps.length - 1, i + 1))}
          disabled={currentIdx >= steps.length - 1 || !canAdvance}
          className="flex items-center gap-1 rounded-lg px-4 py-3 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition disabled:opacity-30"
        >
          Skip <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
