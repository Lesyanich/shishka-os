import { describe, it, expect } from 'vitest'

describe('EquipmentCapacityBar', () => {
  it('module exports EquipmentCapacityBar', async () => {
    const mod = await import('./EquipmentCapacityBar')
    expect(mod.EquipmentCapacityBar).toBeDefined()
  })
})
