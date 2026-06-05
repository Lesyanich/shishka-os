import { describe, it, expect } from 'vitest'

describe('AddItemRow', () => {
  it('module exports AddItemRow', async () => {
    const mod = await import('./AddItemRow')
    expect(mod.AddItemRow).toBeDefined()
  })
})
