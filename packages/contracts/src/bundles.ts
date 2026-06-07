/**
 * Manakish bundle definitions — the single source of truth shared by the
 * ordering site (apps/web), the create-order edge function (mirrored inline,
 * Deno can't import the workspace pkg), and the admin /menu badge.
 *
 * A bundle is a "build-your-own" set: the customer picks `manakishCount`
 * manakish (repeats allowed) from the manakish category and `sauceCount`
 * sauces from the ฿39 sauce cups. The bundle price is computed from the
 * chosen manakish — never a flat price — and is always cheaper than à la
 * carte because of BUNDLE_DISCOUNT_PCT. The sauces are free.
 */

/** Category whose available SALE dishes are eligible manakish. */
export const MANAKISH_CATEGORY = 'KP-FIN-MAN'
/** Category whose cheap (≤ SAUCE_MAX_PRICE) available SALE dishes are the free sauces. */
export const SAUCE_CATEGORY = 'KP-FIN-SDR'
/** Only sauce "cups" (฿39 today) qualify as the free bundle sauce — not the big dips. */
export const SAUCE_MAX_PRICE = 50
/** Category that holds the bundle dishes themselves. */
export const BUNDLE_CATEGORY = 'KP-FIN-BND'

/** Discount applied to the manakish subtotal. Owner-tunable. */
export const BUNDLE_DISCOUNT_PCT = 0.15

export interface BundleDef {
  /** nomenclature.product_code of the bundle dish. */
  code: string
  /** How many manakish the customer must pick (repeats allowed). */
  manakishCount: number
  /** How many free sauces are included. */
  sauceCount: number
}

export const MANAKISH_BUNDLES: readonly BundleDef[] = [
  { code: 'SALE-BUNDLE_MANAKISH_4', manakishCount: 4, sauceCount: 1 },
  { code: 'SALE-BUNDLE_MANAKISH_8', manakishCount: 8, sauceCount: 2 },
  { code: 'SALE-BUNDLE_MANAKISH_12', manakishCount: 12, sauceCount: 3 },
] as const

export function findBundle(code: string): BundleDef | undefined {
  return MANAKISH_BUNDLES.find((b) => b.code === code)
}

/** True if a product_code is one of the manakish bundles. */
export function isBundleCode(code: string): boolean {
  return MANAKISH_BUNDLES.some((b) => b.code === code)
}

/**
 * Bundle price = manakish subtotal × (1 − discount), rounded to the nearest baht.
 * Pass the per-unit price of every chosen manakish (a 4-set passes 4 numbers;
 * repeats appear as repeated entries). Sauces are free and excluded.
 *
 * Each manakish is discounted and rounded individually (NOT the subtotal), so
 * the result matches the POS exactly: on Loyverse each manakish is a slot-
 * modifier priced at round(price × (1 − discount)), e.g. ฿59 → ฿50.
 */
export function bundlePrice(manakishUnitPrices: number[]): number {
  return manakishUnitPrices.reduce((sum, p) => sum + Math.round(p * (1 - BUNDLE_DISCOUNT_PCT)), 0)
}

/** À-la-carte total (no discount) — used to show the customer their savings. */
export function alaCarteTotal(manakishUnitPrices: number[]): number {
  return manakishUnitPrices.reduce((sum, p) => sum + p, 0)
}
