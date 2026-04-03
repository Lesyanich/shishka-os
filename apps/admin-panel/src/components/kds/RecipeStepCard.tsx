import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Pause,
  Play,
  Thermometer,
  Target,
  Timer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { RecipeStep } from '../../hooks/useRecipeSteps'

// ─── Props ───────────────────────────────────────────────────────

interface RecipeStepCardProps {
  step: RecipeStep
  stepIndex: number
  totalSteps: number
  onPrev: () => void
  onNext: () => void
  onDone: (confirmedTemp?: number) => void
}

// ─── Component ───────────────────────────────────────────────────

export function RecipeStepCard({
  step,
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
  onDone,
}: RecipeStepCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(step.duration_min * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [confirmedTemp, setConfirmedTemp] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset timer when step changes
  useEffect(() => {
    setSecondsLeft(step.duration_min * 60)
    setTimerRunning(false)
    setConfirmedTemp('')
    setNotesOpen(false)
  }, [step.id, step.duration_min])

  // Timer tick
  useEffect(() => {
    if (timerRunning && secondsLeft > 0) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            setTimerRunning(false)
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerRunning, secondsLeft])

  const toggleTimer = useCallback(() => {
    if (secondsLeft === 0) {
      // Reset
      setSecondsLeft(step.duration_min * 60)
      setTimerRunning(true)
    } else {
      setTimerRunning((r) => !r)
    }
  }, [secondsLeft, step.duration_min])

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const timerPct = step.duration_min > 0 ? ((step.duration_min * 60 - secondsLeft) / (step.duration_min * 60)) * 100 : 0

  const needsTempConfirm = step.internal_temp_c != null

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        step.is_passive
          ? 'border-sky-500/30 bg-sky-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      }`}
    >
      {/* Header: step X of Y + timer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          STEP {stepIndex + 1} of {totalSteps}
        </span>
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-slate-400" />
          <span
            className={`font-mono text-sm font-bold ${
              secondsLeft === 0 ? 'text-emerald-400' : timerRunning ? 'text-amber-300' : 'text-slate-200'
            }`}
          >
            {timerStr}
          </span>
          <button
            type="button"
            onClick={toggleTimer}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            {timerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Timer progress bar */}
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            step.is_passive ? 'bg-sky-500/60' : 'bg-amber-500/60'
          }`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* Operation name + passive badge */}
      <div className="flex items-center gap-2">
        <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">
          {step.operation_name}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            step.is_passive
              ? 'bg-sky-500/15 text-sky-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {step.is_passive ? 'PASSIVE' : 'ACTIVE'}
        </span>
      </div>

      {/* Equipment */}
      {step.equipment_name && (
        <p className="text-xs text-slate-400">
          Equipment: <span className="text-slate-200">{step.equipment_name}</span>
        </p>
      )}

      {/* Instruction text */}
      <div className="rounded-lg bg-slate-800/60 p-3">
        <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
          {step.description}
        </p>
      </div>

      {/* Temperature targets */}
      <div className="flex items-center gap-4 flex-wrap">
        {step.temperature_c != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Thermometer className="h-3.5 w-3.5 text-red-400" />
            <span className="text-slate-400">Target:</span>
            <span className="font-semibold text-slate-100">{step.temperature_c}°C</span>
          </div>
        )}
        {step.internal_temp_c != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Target className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400">Internal temp:</span>
            <span className="font-semibold text-emerald-300">{step.internal_temp_c}°C</span>
          </div>
        )}
      </div>

      {/* HACCP: confirm internal temperature */}
      {needsTempConfirm && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <Target className="h-4 w-4 shrink-0 text-emerald-400" />
          <label className="text-[11px] text-emerald-300 whitespace-nowrap">Confirm temp:</label>
          <input
            type="number"
            value={confirmedTemp}
            onChange={(e) => setConfirmedTemp(e.target.value)}
            placeholder={`${step.internal_temp_c}°C`}
            className="h-7 w-20 rounded border border-emerald-500/30 bg-slate-900 px-2 text-center text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <span className="text-[10px] text-emerald-400/60">°C</span>
        </div>
      )}

      {/* Chef notes (collapsible) */}
      {step.notes && (
        <div>
          <button
            type="button"
            onClick={() => setNotesOpen(!notesOpen)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            Chef notes
            {notesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {notesOpen && (
            <p className="mt-1 rounded-lg bg-slate-800/40 p-2 text-[11px] text-slate-400 italic">
              {step.notes}
            </p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={stepIndex === 0}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev Step
        </button>

        <button
          type="button"
          onClick={() => onDone(confirmedTemp ? parseFloat(confirmedTemp) : undefined)}
          disabled={needsTempConfirm && !confirmedTemp}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" /> DONE
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={stepIndex >= totalSteps - 1}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          Next Step <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
