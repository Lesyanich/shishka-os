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
})
