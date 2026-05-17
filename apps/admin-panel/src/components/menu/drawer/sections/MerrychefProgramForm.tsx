import { Thermometer, Timer } from 'lucide-react'

interface MerrychefProgram {
  temp_c: number
  time_sec: number
}

interface MerrychefProgramFormProps {
  program: MerrychefProgram | null
  onChange: (program: MerrychefProgram | null) => void
  readOnly?: boolean
}

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
    return (
      <div className="flex items-center gap-4 text-xs">
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
    )
  }

  const tempC = program?.temp_c ?? ''
  const timeSec = program?.time_sec ?? ''

  const update = (field: 'temp_c' | 'time_sec', raw: string) => {
    const num = raw === '' ? null : Number(raw)
    if (num != null && isNaN(num)) return
    const next = {
      temp_c: field === 'temp_c' ? (num ?? 0) : (program?.temp_c ?? 0),
      time_sec:
        field === 'time_sec' ? (num ?? 0) : (program?.time_sec ?? 0),
    }
    if (next.temp_c === 0 && next.time_sec === 0) {
      onChange(null)
      return
    }
    onChange(next)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-cream/60">
        <Thermometer className="h-3.5 w-3.5 text-brick-soft" />
        <input
          type="number"
          value={tempC}
          onChange={(e) => update('temp_c', e.target.value)}
          placeholder="C"
          min={0}
          max={300}
          className="w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
        />
        <span>&deg;C</span>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-cream/60">
        <Timer className="h-3.5 w-3.5 text-amber-watch" />
        <input
          type="number"
          value={timeSec}
          onChange={(e) => update('time_sec', e.target.value)}
          placeholder="sec"
          min={0}
          className="w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-right text-xs text-cream focus:border-forest-soft focus:outline-none"
        />
        <span>sec</span>
      </label>
    </div>
  )
}
