/**
 * Manakish bundle definitions — shared by the ordering site (apps/web), the
 * create-order edge function, and the admin /menu badge.
 *
 * A bundle is a "build-your-own" set: the customer picks `manakishCount`
 * manakish (repeats allowed) from the manakish category and `sauceCount` free
 * sauces. The price is computed from the chosen manakish — never a flat price —
 * and is always cheaper than à la carte.
 *
 * The discount is NOT hard-coded here: it lives in the `price_tiers` table
 * (one tier per bundle size, escalating — the more you buy, the bigger the
 * discount). Each bundle maps to its tier via `tierCode`; callers fetch the
 * tier's `discount_pct` from the DB and pass it to the pricing helpers.
 */

/** Category whose available SALE dishes are eligible manakish. */
export const MANAKISH_CATEGORY = 'KP-FIN-MAN'
/** Category whose cheap (≤ SAUCE_MAX_PRICE) available SALE dishes are the free sauces. */
export const SAUCE_CATEGORY = 'KP-FIN-SDR'
/** Only sauce "cups" (฿39 today) qualify as the free bundle sauce — not the big dips. */
export const SAUCE_MAX_PRICE = 50
/** Category that holds the bundle dishes themselves. */
export const BUNDLE_CATEGORY = 'KP-FIN-BND'

export interface BundleDef {
  /** nomenclature.product_code of the bundle dish. */
  code: string
  /** How many manakish the customer must pick (repeats allowed). */
  manakishCount: number
  /** How many free sauces are included. */
  sauceCount: number
  /** price_tiers.tier_code holding this size's discount. */
  tierCode: string
}

export const MANAKISH_BUNDLES: readonly BundleDef[] = [
  { code: 'SALE-BUNDLE_MANAKISH_4', manakishCount: 4, sauceCount: 1, tierCode: 'bundle4' },
  { code: 'SALE-BUNDLE_MANAKISH_8', manakishCount: 8, sauceCount: 2, tierCode: 'bundle8' },
  { code: 'SALE-BUNDLE_MANAKISH_12', manakishCount: 12, sauceCount: 3, tierCode: 'bundle12' },
] as const

export function findBundle(code: string): BundleDef | undefined {
  return MANAKISH_BUNDLES.find((b) => b.code === code)
}

/** True if a product_code is one of the manakish bundles. */
export function isBundleCode(code: string): boolean {
  return MANAKISH_BUNDLES.some((b) => b.code === code)
}

/**
 * One manakish's discounted price: regular × (1 − discount%), rounded per item
 * (NOT on the subtotal) so it matches the per-item tier price everywhere.
 * `discountPct` is a whole number, e.g. 15 for −15%.
 */
export function tierPrice(regularPrice: number, discountPct: number): number {
  return Math.round(regularPrice * (1 - discountPct / 100))
}

/**
 * Bundle price = Σ of each chosen manakish's discounted price. Pass the regular
 * per-unit price of every chosen manakish (repeats appear as repeated entries)
 * and the bundle size's discount %. Sauces are free and excluded.
 */
export function bundlePrice(manakishRegularPrices: number[], discountPct: number): number {
  return manakishRegularPrices.reduce((sum, p) => sum + tierPrice(p, discountPct), 0)
}

/** À-la-carte total (no discount) — used to show the customer their savings. */
export function alaCarteTotal(manakishRegularPrices: number[]): number {
  return manakishRegularPrices.reduce((sum, p) => sum + p, 0)
}
