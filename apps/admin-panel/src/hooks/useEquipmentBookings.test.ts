import { describe, it, expect } from 'vitest'

describe('useEquipmentBookings', () => {
  it('module exports useEquipmentBookings', async () => {
    const mod = await import('./useEquipmentBookings')
    expect(mod.useEquipmentBookings).toBeDefined()
  })
})
