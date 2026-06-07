import { describe, it, expect } from 'vitest'
import { buildChildren, manakishPrices, previewPrice, previewSavings, totalQty } from './bundle.ts'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const dish = (id: string, name: string, price: number | null): MenuDish => ({
  id,
  product_code: `SALE-${id.toUpperCase()}`,
  name,
  description: null,
  price,
  portion_size: null,
  portion_unit: null,
  image_url: null,
  is_featured: false,
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  category_id: null,
  category_code: 'KP-FIN-MAN',
  category_name: null,
  tags: [],
  allergens: [],
})

const zaatar = dish('zaatar', "Za'atar", 59)
const beef = dish('beef', 'Beef', 69)
const truffle = dish('truffle', 'Truffle & Lamb', 79)
const pool = [zaatar, beef, truffle]
const sauce = dish('hummus', 'Hummus Sauce', 39)

describe('totalQty', () => {
  it('sums selected quantities', () => {
    expect(totalQty({ a: 2, b: 1 })).toBe(3)
    expect(totalQty({})).toBe(0)
  })
})

describe('manakishPrices', () => {
  it('expands repeats into one price entry per unit', () => {
    expect(manakishPrices({ zaatar: 4 }, pool)).toEqual([59, 59, 59, 59])
  })
  it('mixes flavours', () => {
    expect(manakishPrices({ zaatar: 2, beef: 2 }, pool).sort()).toEqual([59, 59, 69, 69])
  })
})

describe('previewPrice', () => {
  it('applies the 15% discount and rounds to the nearest baht', () => {
    // 4 × 59 = 236 → ×0.85 = 200.6 → 201
    expect(previewPrice({ zaatar: 4 }, pool)).toBe(201)
  })
  it('scales with the chosen flavours (truffle costs more)', () => {
    const cheap = previewPrice({ zaatar: 4 }, pool)
    const pricey = previewPrice({ truffle: 4 }, pool)
    expect(pricey).toBeGreaterThan(cheap)
  })
  it('is always cheaper than buying the same set à la carte', () => {
    const sel = { zaatar: 2, beef: 1, truffle: 1 }
    const alaCarte = manakishPrices(sel, pool).reduce((s, p) => s + p, 0)
    expect(previewPrice(sel, pool)).toBeLessThan(alaCarte)
  })
})

describe('previewSavings', () => {
  it('equals à-la-carte minus the discounted price', () => {
    // 236 − 201 = 35
    expect(previewSavings({ zaatar: 4 }, pool)).toBe(35)
  })
})

describe('buildChildren', () => {
  it('emits manakish lines then sauce lines with roles + quantities', () => {
    const children = buildChildren({ zaatar: 3, beef: 1 }, { hummus: 1 }, pool, [sauce])
    expect(children).toEqual([
      { dish: zaatar, quantity: 3, role: 'manakish' },
      { dish: beef, quantity: 1, role: 'manakish' },
      { dish: sauce, quantity: 1, role: 'sauce' },
    ])
  })
  it('drops zero-quantity selections', () => {
    const children = buildChildren({ zaatar: 4, beef: 0 }, {}, pool, [sauce])
    expect(children).toHaveLength(1)
    expect(children[0].dish.id).toBe('zaatar')
  })
})
