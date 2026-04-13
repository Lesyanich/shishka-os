import { describe, it, expect } from 'vitest'

describe('PinPad', () => {
  it('exports PinPad component', async () => {
    const mod = await import('./PinPad')
    expect(mod.PinPad).toBeDefined()
  })
})
