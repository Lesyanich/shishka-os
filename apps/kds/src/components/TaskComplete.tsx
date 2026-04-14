import { useState, useCallback, useMemo } from 'react'
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCook } from '../contexts/CookContext'
import type { ProductionTask } from '../types/tasks'
import type { WasteType } from '../types/haccp'

interface TaskCompleteProps {
  task: ProductionTask
  onDone: () => void
}

const WASTE_TYPES: { value: WasteType; label: string }[] = [
  { value: 'prep_waste', label: 'Prep Waste' },
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'human_error', label: 'Human Error' },
  { value: 'rework', label: 'Rework' },
]

export function TaskComplete({ task, onDone }: TaskCompleteProps) {
  const { cook } = useCook()
  const [netWeight, setNetWeight] = useState('')
  const [wasteType, setWasteType] = useState<WasteType>('prep_waste')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grossWeight = task.gross_weight ?? 0
  const netVal = parseFloat(netWeight)
  const wastePct = useMemo(() => {
    if (isNaN(netVal) || grossWeight <= 0) return null
    return ((grossWeight - netVal) / grossWeight * 100).toFixed(1)
  }, [netVal, grossWeight])

  const normWastePct = 10 // TODO: fetch from nomenclature.norm_waste_pct
  const hasVariance = wastePct != null && Math.abs(parseFloat(wastePct) - normWastePct) > 5

  const handleFinish = useCallback(async () => {
    if (!cook || isNaN(netVal)) return
    setSubmitting(true)
    setError(null)

    // 1. Log waste entry
    const { data: wasteResult, error: wasteErr } = await supabase.rpc('fn_log_waste_entry', {
      p_task_id: task.id,
      p_waste_type: wasteType,
      p_gross: grossWeight,
      p_net: netVal,
      p_norm_pct: normWastePct,
      p_staff_id: cook.id,
      p_notes: notes || null,
    })

    if (wasteErr) {
      setError(wasteErr.message)
      setSubmitting(false)
      return
    }

    const wr = wasteResult as { ok: boolean; error?: string }
    if (!wr.ok) {
      setError(wr.error ?? 'Failed to log waste')
      setSubmitting(false)
      return
    }

    // 2. Complete the task
    const { data: completeResult, error: completeErr } = await supabase.rpc('fn_complete_kds_task', {
      p_task_id: task.id,
      p_net_weight: netVal,
      p_staff_id: cook.id,
    })

    if (completeErr) {
      setError(completeErr.message)
      setSubmitting(false)
      return
    }

    const cr = completeResult as { ok: boolean; error?: string }
    if (!cr.ok) {
      setError(cr.error ?? 'Failed to complete task')
      setSubmitting(false)
      return
    }

    onDone()
  }, [cook, netVal, task.id, wasteType, grossWeight, normWastePct, notes, onDone])

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Task Complete</h2>
        <p className="text-sm text-slate-500">
          {task.target_nomenclature?.name ?? 'Production Task'}
        </p>
      </div>

      {/* Gross weight display */}
      <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 p-3 text-sm text-slate-300">
        <Scale className="h-4 w-4 text-amber-400" />
        Gross weight: <span className="font-bold text-slate-100">{grossWeight} kg</span>
      </div>

      {/* Net weight input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Net weight (finished product):</label>
        <input
          type="number"
          inputMode="decimal"
          value={netWeight}
          onChange={e => setNetWeight(e.target.value)}
          placeholder="0.00 kg"
          className="h-16 w-full rounded-xl border border-emerald-500/30 bg-slate-900 px-4 text-center text-3xl font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Live waste calculation */}
      {wastePct != null && (
        <div className={`rounded-xl p-4 text-center ${
          hasVariance ? 'border border-rose-500/40 bg-rose-500/5' : 'bg-slate-800/60'
        }`}>
          <p className="text-sm text-slate-400">Waste</p>
          <p className={`text-3xl font-bold ${hasVariance ? 'text-rose-400' : 'text-slate-100'}`}>
            {wastePct}%
          </p>
          <p className="text-xs text-slate-500">Norm: {normWastePct}%</p>
          {hasVariance && (
            <div className="mt-2 flex items-center justify-center gap-1 text-xs text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Above normal waste — classify below
            </div>
          )}
        </div>
      )}

      {/* Waste type selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Waste type:</label>
        <div className="grid grid-cols-2 gap-2">
          {WASTE_TYPES.map(wt => (
            <button
              key={wt.value}
              type="button"
              onClick={() => setWasteType(wt.value)}
              className={`rounded-xl py-3 text-sm font-medium transition ${
                wasteType === wt.value
                  ? 'bg-amber-600 text-white'
                  : 'border border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {wt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
      />

      {/* Error */}
      {error && (
        <p className="text-center text-sm text-rose-400">{error}</p>
      )}

      {/* Finish button */}
      <button
        type="button"
        onClick={handleFinish}
        disabled={submitting || isNaN(netVal) || netVal < 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40"
      >
        <CheckCircle2 className="h-6 w-6" />
        {submitting ? 'Completing...' : 'FINISH TASK'}
      </button>
    </div>
  )
}
