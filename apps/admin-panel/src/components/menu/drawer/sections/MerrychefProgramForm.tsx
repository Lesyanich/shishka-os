import { Thermometer, Timer, Wind, Microwave, StickyNote } from 'lucide-react'
import type { MerrychefProgram } from '../../../../hooks/useDishCardSave'

export type { MerrychefProgram }

interface MerrychefProgramFormProps {
  program: MerrychefProgram | null
  onChange: (program: MerrychefProgram | null) => void
  readOnly?: boolean
}

const numOr = (n: unknown): number | undefined =>
  typeof n === 'number' && !isNaN(n) ? n : undefined

export function MerrychefProgramForm({
  program,
  onChange,
  readOnly,
}: MerrychefProgramFormProps) {
  if (readOnly) {
    if (!program)
      return (
        <span className="text-xs text-amber-400/80">
          No Merrychef program defined
        </span>
      )
    const fan = numOr(program.fan_pct)
    const mw = numOr(program.microwave_pct)
    return (
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-cream/80">
            <Thermometer className="h-3.5 w-3.5 text-brick-soft" />
            {program.temp_c}&deg;C
          </span>
          <span className="flex items-center gap-1 text-cream/80">
            <Timer className="h-3.5 w-3.5 text-amber-watch" />
            {program.time_sec}s ({Math.floor(program.time_sec / 60)}m{' '}
            {program.time_sec % 60}s)
          </span>
        </div>
        {(fan !== undefined || mw !== undefined) && (
          <div className="flex items-center gap-4 text-cream/70">
            {fan !== undefined && (
              <span className="flex items-center gap-1">
                <Wind className="h-3.5 w-3.5 text-sky-400" />
                {fan}% fan
              </span>
            )}
            {mw !== undefined && (
              <span className="flex items-center gap-1">
                <Microwave className="h-3.5 w-3.5 text-violet-400" />
                {mw}% microwave
              </span>
            )}
          </div>
        )}
        {program.notes && (
          <div className="flex items-start gap-1 text-cream/60">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cream/50" />
            <span className="whitespace-pre-wrap">{program.notes}</span>
          </div>
        )}
      </div>
    )
  }

  const update = (patch: Partial<MerrychefProgram>) => {
    const merged = {
      ...(program ?? { temp_c: 0, time_sec: 0 }),
      ...patch,
    } as MerrychefProgram
    const next: MerrychefProgram = {
      temp_c: merged.temp_c ?? 0,
      time_sec: merged.time_sec ?? 0,
    }
    const fan = numOr(merged.fan_pct)
    const mw = numOr(merged.microwave_pct)
    if (fan !== undefined) next.fan_pct = fan
    if (mw !== undefined) next.microwave_pct = mw
    if (merged.notes && merged.notes.trim()) next.notes = merged.notes
    if (
      next.temp_c === 0 &&
      next.time_sec === 0 &&
      next.fan_pct === undefined &&
      next.microwave_pct === undefined &&
      !next.notes
    ) {
      onChange(null)
      return
    }
    onChange(next)
  }

  const onNum = (
    field: 'temp_c' | 'time_sec' | 'fan_pct' | 'microwave_pct',
    raw: string,
  ) => {
    if (raw === '') {
      update({ [field]: undefined } as Partial<MerrychefProgram>)
      return
    }
    const num = Number(raw)
    if (isNaN(num)) return
    update({ [field]: num } as Partial<MerrychefProgram>)
  }

  const tempC = program?.temp_c ?? ''
  const timeSec = program?.time_sec ?? ''
  const fanPct = program?.fan_pct ?? ''
  const microwavePct = program?.microwave_pct ?? ''
  const notes = program?.notes ?? ''

  const inputCls =
    'w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-cream/60">
          <Thermometer className="h-3.5 w-3.5 text-brick-soft" />
          <input
            type="number"
            value={tempC}
            onChange={(e) => onNum('temp_c', e.target.value)}
            placeholder="C"
            min={0}
            max={300}
            className={inputCls}
          />
          <span>&deg;C</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-cream/60">
          <Timer className="h-3.5 w-3.5 text-amber-watch" />
          <input
            type="number"
            value={timeSec}
            onChange={(e) => onNum('time_sec', e.target.value)}
            placeholder="sec"
            min={0}
            className={inputCls}
          />
          <span>sec</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-cream/60">
          <Wind className="h-3.5 w-3.5 text-sky-400" />
          <input
            type="number"
            value={fanPct}
            onChange={(e) => onNum('fan_pct', e.target.value)}
            placeholder="—"
            min={0}
            max={100}
            className={inputCls}
          />
          <span>% fan</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-cream/60">
          <Microwave className="h-3.5 w-3.5 text-violet-400" />
          <input
            type="number"
            value={microwavePct}
            onChange={(e) => onNum('microwave_pct', e.target.value)}
            placeholder="—"
            min={0}
            max={100}
            className={inputCls}
          />
          <span>% microwave</span>
        </label>
      </div>
      <label className="flex items-start gap-1.5 text-xs text-cream/60">
        <StickyNote className="mt-1.5 h-3.5 w-3.5 shrink-0 text-cream/50" />
        <textarea
          value={notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Optional notes (e.g. bake until golden)"
          rows={2}
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-cream focus:border-forest-soft focus:outline-none"
        />
      </label>
    </div>
  )
}
