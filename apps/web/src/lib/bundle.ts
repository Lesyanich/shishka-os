import { bundlePrice, alaCarteTotal } from '@shishka/contracts'
import type { MenuDish } from '../hooks/usePublicMenu.ts'
import type { BundleChildLine } from '../state/cart.tsx'

/** dishId → chosen quantity (repeats allowed). */
export type Selection = Record<string, number>

export function totalQty(sel: Selection): number {
  return Object.values(sel).reduce((n, q) => n + q, 0)
}

/** Expand a manakish selection into the flat per-unit price list the pricing
 *  helpers expect (a qty of 3 contributes its price three times). */
export function manakishPrices(sel: Selection, pool: MenuDish[]): number[] {
  const byId = new Map(pool.map((d) => [d.id, d]))
  const prices: number[] = []
  for (const [id, qty] of Object.entries(sel)) {
    const price = byId.get(id)?.price ?? 0
    for (let i = 0; i < qty; i++) prices.push(price)
  }
  return prices
}

/** Discounted bundle preview price (client-side; server recomputes on order).
 *  `discountPct` is the bundle size's tier discount, e.g. 15 for −15%. */
export function previewPrice(
  manakishSel: Selection,
  manakishPool: MenuDish[],
  discountPct: number,
): number {
  return bundlePrice(manakishPrices(manakishSel, manakishPool), discountPct)
}

/** How much the customer saves versus buying the same manakish à la carte. */
export function previewSavings(
  manakishSel: Selection,
  manakishPool: MenuDish[],
  discountPct: number,
): number {
  const prices = manakishPrices(manakishSel, manakishPool)
  return alaCarteTotal(prices) - bundlePrice(prices, discountPct)
}

/** Turn the two selections into cart child lines (manakish first, then sauces). */
export function buildChildren(
  manakishSel: Selection,
  sauceSel: Selection,
  manakishPool: MenuDish[],
  saucePool: MenuDish[],
): BundleChildLine[] {
  const pick = (sel: Selection, pool: MenuDish[], role: 'manakish' | 'sauce'): BundleChildLine[] => {
    const byId = new Map(pool.map((d) => [d.id, d]))
    return Object.entries(sel)
      .filter(([, qty]) => qty > 0)
      .flatMap(([id, qty]) => {
        const dish = byId.get(id)
        return dish ? [{ dish, quantity: qty, role }] : []
      })
  }
  return [...pick(manakishSel, manakishPool, 'manakish'), ...pick(sauceSel, saucePool, 'sauce')]
}
