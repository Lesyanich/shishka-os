import type { DishCostTrust } from './costTrust'
import { costTrustPresentation } from './costTrust'

interface CostTrustBadgeProps {
  trust: DishCostTrust | null | undefined
  /** Extra classes (spacing at the call site). */
  className?: string
}

/** Provenance mark next to a cost figure. Same visual family as the original
 *  `~est` badge in OwnerTable — tinted background, matching text, always a word
 *  so the colour is never the only carrier of meaning (DS anti-pattern). */
export function CostTrustBadge({ trust, className = '' }: CostTrustBadgeProps) {
  const p = costTrustPresentation(trust)
  if (!p) return null
  return (
    <span title={p.title} className={`${p.className} ${className}`.trim()}>
      {p.label}
    </span>
  )
}
