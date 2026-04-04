interface DeviationBadgeProps {
  label: string
  actual: number
  expected: number
  unit: string
}

function getVariance(actual: number, expected: number): number {
  if (expected === 0) return 0
  return ((actual / expected) - 1) * 100
}

function getVarianceColor(pct: number): string {
  const abs = Math.abs(pct)
  if (abs <= 5) return 'text-emerald-400 bg-emerald-500/10'
  if (abs <= 10) return 'text-amber-400 bg-amber-500/10'
  return 'text-rose-400 bg-rose-500/10'
}

export function DeviationBadge({ label, actual, expected, unit }: DeviationBadgeProps) {
  const variance = getVariance(actual, expected)
  const colorClass = getVarianceColor(variance)
  const sign = variance > 0 ? '+' : ''

  return (
    <div className={['inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', colorClass].join(' ')}>
      <span className="text-slate-400">{label}:</span>
      <span>
        {actual.toFixed(1)}/{expected.toFixed(1)} {unit}
      </span>
      <span className="font-semibold">
        ({sign}{variance.toFixed(1)}%)
      </span>
    </div>
  )
}
