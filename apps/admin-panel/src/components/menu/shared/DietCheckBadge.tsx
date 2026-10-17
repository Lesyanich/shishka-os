import type { DishDietCheck } from './dietCheck'
import { dietCheckPresentation } from './dietCheck'

interface DietCheckBadgeProps {
  row: DishDietCheck | null | undefined
  className?: string
}

/** Diet-tag review mark next to a dish. Always a word, never colour alone. */
export function DietCheckBadge({ row, className = '' }: DietCheckBadgeProps) {
  const p = dietCheckPresentation(row)
  if (!p) return null
  return (
    <span title={p.title} className={`${p.className} ${className}`.trim()} data-testid="diet-check-badge">
      {p.label}
    </span>
  )
}
