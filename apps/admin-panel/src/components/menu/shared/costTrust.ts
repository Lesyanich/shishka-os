/** Cost provenance — how much a displayed cost can be trusted.
 *
 * Source of truth is the DB (migration 482, v_dish_cost_trust rolled up over the
 * BOM tree). Nothing here recomputes a class; this module only turns the class
 * the view already decided into owner-facing words and the badge recipe.
 *
 * WORDING CONTRACT — read before editing a string.
 *   `unverified` means the stored cost and the purchase history disagree, NOT
 *   that the displayed number is the wrong one of the two. The 2026-10-16 audit
 *   (MC 00a81c22) established the opposite for spices and oils: there the stored
 *   cost is the plausible one and purchase_logs is the corrupt source — a 100 g
 *   pack booked as 1 kg. Olive Oil reads 440 THB/L stored against 2400 THB/L in
 *   its own history. So the copy says "we cannot tell which", never "this is wrong".
 */

/** Per-dish class from v_dish_cost_trust.trust_class, worst-first. */
export type DishTrustClass =
  | 'no_bom'      // no costed BOM line at all — the number measures nothing
  | 'no_cost'     // an ingredient has no cost, so the dish cost is understated
  | 'deleted'     // an ingredient is retired but still priced into the dish
  | 'unverified'  // stored cost and purchase history disagree, or nothing backs it
  | 'estimated'   // catalog estimate, openly not a real purchase
  | 'manual'      // a human set it by hand
  | 'verified'    // agrees with this product's own purchase history

/** Row of v_dish_cost_trust (mig 482). */
export interface DishCostTrust {
  dish_id: string
  product_code: string
  trust_class: DishTrustClass
  trust_rank: number
  ingredient_count: number
  zero_cost_count: number
  deleted_count: number
  unverified_count: number
  estimated_count: number
  manual_count: number
  verified_count: number
  has_deleted_ingredient: boolean
  worst_ingredient_name: string | null
  worst_ingredient_code: string | null
  worst_ingredient_reason: string | null
  worst_ingredient_cost: number | null
  worst_ingredient_history_cost: number | null
  worst_ingredient_divergence: number | null
}

export interface CostTrustPresentation {
  /** Short badge text. Always present — colour never carries meaning alone. */
  label: string
  /** Tooltip, in the owner's words, saying WHY. */
  title: string
  /** Tailwind recipe. Mirrors the `~est` badge: tinted bg + matching text. */
  className: string
  /** Longer sentence for the drawer, where there is room for one. */
  detail: string
}

const badge = (tint: string) =>
  `rounded-sm px-1 py-0.5 text-[9px] font-medium leading-none ${tint}`

/** Green = backed by purchases · amber = not solid · red = money is missing.
 *  Red is reserved for "no cost at all" so it keeps one meaning. */
const TINT = {
  good: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)]',
  warn: 'bg-amber-watch/15 text-amber-watch',
  neutral: 'bg-surface-3 text-cream/60',
  bad: 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)]',
} as const

function thb(n: number | null | undefined): string {
  if (n == null) return '—'
  return `฿${n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2)}`
}

/** Name the ingredient that caused the class, so the tooltip can point at it. */
function culprit(trust: DishCostTrust | null | undefined): string {
  return trust?.worst_ingredient_name ?? 'one of its ingredients'
}

/** The disagreement, spelled out with both numbers and neither one blamed. */
function disagreement(trust: DishCostTrust): string {
  const { worst_ingredient_cost: stored, worst_ingredient_history_cost: history } = trust
  if (stored == null || history == null) return ''
  return ` We hold ${thb(stored)} for it while its receipts average ${thb(history)} — one of the two is wrong and the receipt decides which.`
}

/**
 * Turn a dish's trust row into badge text, tooltip and classes.
 * `null` trust (dish not in the view yet, or still loading) renders nothing.
 */
export function costTrustPresentation(
  trust: DishCostTrust | null | undefined,
): CostTrustPresentation | null {
  if (!trust) return null

  switch (trust.trust_class) {
    case 'no_bom':
      return {
        label: 'no BOM',
        title:
          'No recipe lines, so this cost is not a measurement of anything — the margin shown is whatever the price is. Add a BOM, or set a purchase cost if it is a resale item.',
        detail:
          'This dish has no BOM at all. Its cost is not calculated from anything, so the margin shown is pure price.',
        className: badge(TINT.bad),
      }

    case 'no_cost':
      return {
        label: 'cost missing',
        title: `${culprit(trust)} has no cost on file, so the dish costs more than this. ${trust.zero_cost_count} of ${trust.ingredient_count} ingredients ${trust.zero_cost_count === 1 ? 'is' : 'are'} priced at zero.`,
        detail: `${trust.zero_cost_count} of ${trust.ingredient_count} ingredients ${trust.zero_cost_count === 1 ? 'has' : 'have'} no cost on file — starting with ${culprit(trust)}. The real cost is higher than the figure above.`,
        className: badge(TINT.bad),
      }

    case 'deleted':
      return {
        label: 'retired item',
        title: `${culprit(trust)} is retired but still priced into this dish. Either the recipe is out of date or the ingredient was deleted too early.`,
        detail: `${culprit(trust)} is retired from the catalogue yet still sits in this recipe. Fix the BOM before trusting the number.`,
        className: badge(TINT.warn),
      }

    case 'unverified':
      return {
        label: '?unverified',
        title: `This cost rests on ${culprit(trust)}, whose purchase history says something different.${disagreement(trust)}`,
        detail: `This cost rests on ${culprit(trust)}, whose purchase history says something different.${disagreement(trust)} ${trust.unverified_count} of ${trust.ingredient_count} ingredients ${trust.unverified_count === 1 ? 'is' : 'are'} in that state.`,
        className: badge(TINT.warn),
      }

    case 'estimated':
      return {
        label: '~est',
        title: `Estimated from the Makro catalog — no real purchase backs it yet (${culprit(trust)}).`,
        detail: `${trust.estimated_count} of ${trust.ingredient_count} ingredients ${trust.estimated_count === 1 ? 'is' : 'are'} priced from the Makro catalog rather than a real purchase — starting with ${culprit(trust)}.`,
        className: badge(TINT.warn),
      }

    case 'manual':
      return {
        label: 'hand-set',
        title: `Someone typed this cost in by hand (${culprit(trust)}). It is traceable to a person, not to a receipt.`,
        detail: `${trust.manual_count} of ${trust.ingredient_count} ingredients ${trust.manual_count === 1 ? 'carries' : 'carry'} a hand-entered cost — starting with ${culprit(trust)}. Traceable to a person, not to a receipt.`,
        className: badge(TINT.neutral),
      }

    case 'verified':
      return {
        label: 'verified',
        title: `Every ingredient's cost matches what we actually paid for it (${trust.ingredient_count} ingredient${trust.ingredient_count === 1 ? '' : 's'} checked against purchase history).`,
        detail: `Every one of the ${trust.ingredient_count} ingredient${trust.ingredient_count === 1 ? '' : 's'} is priced from real purchases, within 20% of its own receipts.`,
        className: badge(TINT.good),
      }

    default:
      return null
  }
}

/** Shown when the trust view could not be read at all.
 *
 * Without this, a failed fetch leaves every figure unmarked — which is exactly the
 * screen this feature exists to replace, and the owner would have no way to tell the
 * difference between "nothing is wrong with this cost" and "we could not check".
 * Silence is only acceptable while the view is still loading. */
export const COST_TRUST_UNAVAILABLE =
  'Cost provenance could not be loaded, so nothing below is marked — unmarked here means unchecked, not verified.'

/** True when the class means the figure on screen understates or invents the cost. */
export function isCostUntrustworthy(trust: DishCostTrust | null | undefined): boolean {
  if (!trust) return false
  return trust.trust_class === 'no_bom' || trust.trust_class === 'no_cost'
}
