import { describe, it, expect } from 'vitest'

describe('KitchenLabels', () => {
  it('exports the KitchenLabels page component', async () => {
    const mod = await import('./KitchenLabels')
    expect(mod.KitchenLabels).toBeDefined()
    expect(typeof mod.KitchenLabels).toBe('function')
  })

  it('exposes the lightweight PF-items hook', async () => {
    const mod = await import('../hooks/usePrepLabelItems')
    expect(typeof mod.usePrepLabelItems).toBe('function')
  })

  it('exposes the pantry (RAW jars & bottles) items hook', async () => {
    const mod = await import('../hooks/usePantryLabelItems')
    expect(typeof mod.usePantryLabelItems).toBe('function')
    expect(mod.PANTRY_LABEL_TAG).toBe('pantry-label')
  })

  it('derives item kind from the product_code prefix', async () => {
    const { kindFromCode } = await import('../hooks/usePrepLabelItems')
    expect(kindFromCode('SALE-HUMMUS')).toBe('SALE')
    expect(kindFromCode('PF-TAHINI_SAUCE')).toBe('PF')
    expect(kindFromCode('RAW-OLIVE-OIL')).toBe('RAW')
  })
})
