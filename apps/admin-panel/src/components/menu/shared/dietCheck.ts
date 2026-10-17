/** Diet-tag review state — whether a dish may show plant-based / vegetarian to guests.
 *
 * Source of truth is the DB (migration 513, v_dish_diet_check). Nothing here decides a
 * diet: this module only turns the row the view already produced into owner-facing words
 * and the badge recipe. Spec: docs/plans/spec-diet-tags-derivation.md.
 *
 * WORDING CONTRACT — a flagged dish is NOT wrong, it is UNREVIEWED: its diet tags are hidden
 * from guests (CEO decision) until a person confirms them. Say "hidden", never "invalid".
 */

export type DietCheckReason = 'ok' | 'never_reviewed' | 'composition_changed'

/** Row of v_dish_diet_check (mig 513). */
export interface DishDietCheck {
  dish_id: string
  product_code: string
  needs_check: boolean
  reason: DietCheckReason
  /** Every food leaf is confirmed, so the dish can be confirmed in one click. */
  ready: boolean
  unconfirmed: number
  soft_deleted: number
  ingredients: number
  /** What a confirm would publish. null while not ready. */
  proposed_diets: string[] | null
  /** The managed links currently stored on the dish. */
  published_diets: string[]
  diet_reviewed_at: string | null
  diet_reviewed_by: string | null
}

export interface DietCheckPresentation {
  label: string
  title: string
  className: string
  detail: string
}

const badge = (tint: string) =>
  `rounded-sm px-1 py-0.5 text-[9px] font-medium leading-none ${tint}`

const TINT = {
  good: 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)]',
  warn: 'bg-amber-watch/15 text-amber-watch',
  neutral: 'bg-surface-3 text-cream/60',
} as const

export const DIET_CHECK_UNAVAILABLE =
  'Diet-tag status could not be loaded. An unmarked dish must not be read as a reviewed one.'

function list(diets: string[] | null | undefined): string {
  return diets && diets.length > 0 ? diets.join(' + ') : 'none'
}

export function dietCheckPresentation(
  row: DishDietCheck | null | undefined,
): DietCheckPresentation | null {
  if (!row) return null

  if (!row.needs_check) {
    return {
      label: 'diet ✓',
      title: `Diet tags confirmed: ${list(row.published_diets)}. Shown to guests.`,
      className: badge(TINT.good),
      detail: `Diet tags confirmed (${list(row.published_diets)}) and shown to guests.`,
    }
  }

  if (row.reason === 'composition_changed') {
    return {
      label: 'check tags',
      title:
        'The composition changed since the diet tags were confirmed. They are hidden from guests until someone reviews them.',
      className: badge(TINT.warn),
      detail:
        'The composition changed since the diet tags were confirmed, so they are hidden from guests until you review them.' +
        (row.published_diets.length > 0 ? ` Hidden now: ${list(row.published_diets)}.` : ''),
    }
  }

  // never_reviewed
  if (row.ready) {
    return {
      label: 'diet: ready',
      title: 'Every ingredient is classified. Open the dish to confirm its diet tags.',
      className: badge(TINT.neutral),
      detail: `Every ingredient is classified. Confirming would publish: ${list(row.proposed_diets)}.`,
    }
  }
  const blockers: string[] = []
  if (row.unconfirmed > 0) blockers.push(`${row.unconfirmed} of ${row.ingredients} ingredient(s) unconfirmed`)
  if (row.soft_deleted > 0) blockers.push(`${row.soft_deleted} retired ingredient(s) still in the recipe`)
  if (row.ingredients === 0) blockers.push('no ingredients to classify')
  return {
    label: `diet: ${row.unconfirmed} to do`,
    title: `No diet tags yet: ${blockers.join(', ')}.`,
    className: badge(TINT.neutral),
    detail: `No diet tags yet: ${blockers.join(', ')}. Guests see no diet label until this is resolved.`,
  }
}
