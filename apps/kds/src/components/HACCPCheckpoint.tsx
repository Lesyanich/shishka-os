import { useState } from 'react'
import { ShieldAlert, ThermometerSun, Droplets, Eye, Weight, CheckCircle2, XCircle } from 'lucide-react'
import type { HACCPCheckpointType } from '../types/haccp'

interface HACCPCheckpointProps {
  type: HACCPCheckpointType
  expectedValue: number | null
  tolerance: number | null
  onConfirm: (actualValue: number | null, passed: boolean, notes?: string) => void
  disabled: boolean
}

const typeConfig: Record<HACCPCheckpointType, { label: string; icon: typeof ThermometerSun; unit: string }> = {
  temperature: { label: 'Temperature Check', icon: ThermometerSun, unit: 'C' },
  sanitation: { label: 'Sanitation Check', icon: Droplets, unit: '' },
  visual: { label: 'Visual Quality Check', icon: Eye, unit: '' },
  weight: { label: 'Weight Check', icon: Weight, unit: 'kg' },
}

export function HACCPCheckpoint({ type, expectedValue, tolerance, onConfirm, disabled }: HACCPCheckpointProps) {
  const [actualValue, setActualValue] = useState('')
  const [passFail, setPassFail] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')

  const config = typeConfig[type]
  const Icon = config.icon

  const needsNumericInput = type === 'temperature' || type === 'weight'
  const needsPassFail = type === 'sanitation' || type === 'visual'

  const handleConfirm = () => {
    let passed = false
    let actual: number | null = null

    if (needsNumericInput) {
      actual = parseFloat(actualValue)
      if (isNaN(actual)) return
      if (expectedValue != null && tolerance != null) {
        passed = Math.abs(actual - expectedValue) <= tolerance
      } else {
        passed = true
      }
    } else {
      if (passFail === null) return
      passed = passFail
    }

    onConfirm(actual, passed, notes || undefined)
  }

  const canConfirm = needsNumericInput
    ? actualValue !== '' && !isNaN(parseFloat(actualValue))
    : passFail !== null

  return (
    <div className="rounded-xl border-2 border-rose-500/60 bg-rose-500/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20">
          <ShieldAlert className="h-6 w-6 text-rose-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-rose-300">HACCP CHECKPOINT</h3>
          <p className="text-sm text-slate-400">{config.label}</p>
        </div>
      </div>

      {/* Expected value */}
      {expectedValue != null && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 p-3">
          <Icon className="h-5 w-5 text-amber-400" />
          <span className="text-sm text-slate-300">
            Target: <span className="font-bold text-slate-100">{expectedValue}{config.unit ? `\u00B0${config.unit}` : ''}</span>
            {tolerance != null && (
              <span className="text-slate-500"> (\u00B1{tolerance})</span>
            )}
          </span>
        </div>
      )}

      {/* Numeric input for temperature/weight */}
      {needsNumericInput && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">
            Actual {type === 'temperature' ? 'temperature' : 'weight'}:
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={actualValue}
            onChange={e => setActualValue(e.target.value)}
            placeholder={expectedValue?.toString() ?? '0'}
            className="h-16 w-full rounded-xl border border-rose-500/30 bg-slate-900 px-4 text-center text-3xl font-bold text-slate-100 focus:outline-none focus:border-rose-500"
          />
        </div>
      )}

      {/* Pass/Fail toggle for sanitation/visual */}
      {needsPassFail && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Result:</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPassFail(true)}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition ${
                passFail === true
                  ? 'bg-emerald-600 text-white'
                  : 'border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              <CheckCircle2 className="h-6 w-6" /> PASS
            </button>
            <button
              type="button"
              onClick={() => setPassFail(false)}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition ${
                passFail === false
                  ? 'bg-rose-600 text-white'
                  : 'border border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <XCircle className="h-6 w-6" /> FAIL
            </button>
          </div>
        </div>
      )}

      {/* Notes (optional, shown for visual/sanitation) */}
      {needsPassFail && (
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
        />
      )}

      {/* Confirm button */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm || disabled}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-4 text-lg font-bold text-white transition hover:bg-rose-500 disabled:opacity-40"
      >
        <ShieldAlert className="h-5 w-5" />
        CONFIRM CHECKPOINT
      </button>

      <p className="text-center text-[11px] text-rose-400/60">
        This checkpoint cannot be skipped. All results are logged permanently.
      </p>
    </div>
  )
}
