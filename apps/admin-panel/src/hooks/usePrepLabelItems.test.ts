import { describe, it, expect } from 'vitest'
import { kindFromCode, mapItemRow, type RawItemRow } from './usePrepLabelItems'

describe('usePrepLabelItems', () => {
  it('exports the hook', async () => {
    const mod = await import('./usePrepLabelItems')
    expect(typeof mod.usePrepLabelItems).toBe('function')
  })
})

describe('kindFromCode', () => {
  it('derives kind from the product_code prefix', () => {
    expect(kindFromCode('SALE-HUMMUS')).toBe('SALE')
    expect(kindFromCode('RAW-PEPPER_WHITE')).toBe('RAW')
    expect(kindFromCode('PF-TAHINI_SAUCE')).toBe('PF')
    expect(kindFromCode('MOD-EXTRA')).toBe('PF') // non-SALE/RAW falls through to PF
  })
})

describe('mapItemRow displayName', () => {
  const base = (over: Partial<RawItemRow>): RawItemRow => ({
    id: 'id',
    name: 'name',
    customer_short_name: null,
    product_code: 'RAW-X',
    base_unit: 'kg',
    is_available: true,
    shelf_life_days: null,
    category_id: null,
    category: null,
    ...over,
  })

  it('uses the clean culinary name for a RAW item when set', () => {
    const item = mapItemRow(
      base({
        product_code: 'RAW-PEPPER_WHITE',
        name: 'ARO Ground White Pepper 500 g',
        customer_short_name: 'Ground White Pepper',
      }),
    )
    expect(item.kind).toBe('RAW')
    expect(item.displayName).toBe('Ground White Pepper')
    expect(item.name).toBe('ARO Ground White Pepper 500 g') // procurement name preserved
  })

  it('falls back to the procurement name when a RAW item has no clean name', () => {
    const item = mapItemRow(base({ product_code: 'RAW-TAHINI', name: 'Tahini', customer_short_name: null }))
    expect(item.displayName).toBe('Tahini')
  })

  it('leaves PF/SALE names untouched even if a short name exists', () => {
    const pf = mapItemRow(base({ product_code: 'PF-X', name: 'Hummus Base', customer_short_name: 'Hummus' }))
    expect(pf.displayName).toBe('Hummus Base')
  })
})
