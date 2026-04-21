import { describe, it, expect } from 'vitest'

describe('shared/DishPhotoSlot', () => {
  it('exports DishPhotoSlot component', async () => {
    const mod = await import('./DishPhotoSlot')
    expect(mod.DishPhotoSlot).toBeDefined()
    expect(typeof mod.DishPhotoSlot).toBe('function')
  })
})
