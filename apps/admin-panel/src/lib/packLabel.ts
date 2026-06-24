// Pure helpers for "pack quantity" labels — countable PF preps (e.g. mini buns)
// packed N pieces into ONE package: one label, one batch row, the count printed
// on it. Kept free of React/DOM so the rules stay unit-testable. Used by the
// KitchenLabels LabelEditor; the per-piece weight comes from
// pf_pack_card.portion_weight_g (the DB is the source of truth).

/**
 * A label unit is "countable" when it measures discrete pieces (pcs / portion)
 * rather than a mass or volume (kg / L). Only countable preps get a
 * pieces-per-pack field; mass/volume preps keep the weight input.
 */
export function isCountableUnit(unit: string | null | undefined): boolean {
  return unit === 'pcs' || unit === 'portion'
}

/**
 * Format grams as an ASCII weight string for the TSPL printer ("480 g" /
 * "1.5 kg"). ASCII-only: the printer codepage renders multibyte chars as garbage.
 */
export function formatGramsAscii(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg` : `${Math.round(g)} g`
}

/**
 * QTY string for a countable pack label: the piece count in its unit, suffixed
 * with the total weight when the per-piece weight is known. ASCII only (" / ",
 * never "·", which the printer can't render).
 *   packQtyLabel(8, 'pcs', 60)   → "8 pcs / 480 g"
 *   packQtyLabel(8, 'pcs', null) → "8 pcs"
 */
export function packQtyLabel(count: number, unit: string, portionWeightG: number | null): string {
  const base = `${count} ${unit}`
  if (portionWeightG == null || portionWeightG <= 0) return base
  return `${base} / ${formatGramsAscii(count * portionWeightG)}`
}

/**
 * What one label's batch row stores in the item's base_unit:
 *  - mass base (kg): the per-label weight in grams → kilograms
 *  - countable base (pcs/portion): the pieces packed into this one label
 *  - otherwise (e.g. L volume): one unit, matching prior behaviour
 */
export function packBatchWeight(opts: {
  unit: string
  isCountable: boolean
  gramsNum: number | null
  piecesNum: number | null
}): number {
  const { unit, isCountable, gramsNum, piecesNum } = opts
  if (unit === 'kg' && gramsNum != null) return gramsNum / 1000
  if (isCountable && piecesNum != null) return piecesNum
  return 1
}
