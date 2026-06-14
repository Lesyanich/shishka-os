import type { MenuItem } from '../../../hooks/useMenuData'
import type { MenuRecipeStep } from '../../../hooks/useMenuListEnrichment'

/** Which kitchen station(s) a menu item belongs to.
 *  l1 = Kitchen prep (заготовки), l2 = Assembly point / bar (сборка на заказ). */
export interface Station {
  l1: boolean
  l2: boolean
}

/** Code of the customer-facing "Drinks" umbrella section. Every drink
 *  (coffee / smoothies / juices / lemonades / shots / soft) rolls up to a
 *  section whose code starts with this — bar work, never L1 prep. */
export const DRINK_SECTION_CODE_PREFIX = 'KP-DRK'

/**
 * Effective station membership for a menu item.
 *
 * Source of truth is the per-step station on `recipes_flow` (location →
 * 'L1' / 'L2', surfaced as MenuRecipeStep.location). Until those are filled in
 * we fall back to product type + menu section so no view is ever empty:
 *   - drinks (Drinks umbrella) → L2 only (made to order at the bar)
 *   - PF prep batches          → L1 only (заготовки)
 *   - SALE finished food        → both (prep at L1, final assembly at L2)
 *
 * Once a recipe has any stationed step, that signal wins and the fallback is
 * ignored — so the split sharpens as cooks tag steps in the recipe builder.
 */
export function stationOf(
  item: MenuItem,
  steps: MenuRecipeStep[] | undefined,
  isDrink: boolean,
): Station {
  let hasL1 = false
  let hasL2 = false
  for (const s of steps ?? []) {
    if (s.location === 'L1') hasL1 = true
    else if (s.location === 'L2') hasL2 = true
  }
  if (hasL1 || hasL2) return { l1: hasL1, l2: hasL2 }

  // Fallback — recipe has no stationed steps yet.
  if (isDrink) return { l1: false, l2: true }
  if (item.kind === 'PF') return { l1: true, l2: false }
  // SALE finished food (and any uncategorised) — prep + assembly both apply.
  return { l1: true, l2: true }
}
