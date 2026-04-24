import { describe, expect, it } from 'vitest'

describe('OwnerChip', () => {
  it('exports OwnerChip component', async () => {
    const mod = await import('../OwnerChip')
    expect(typeof mod.OwnerChip).toBe('function')
  })
})
