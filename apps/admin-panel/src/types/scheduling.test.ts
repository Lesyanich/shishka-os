import { describe, it, expect } from 'vitest'

describe('scheduling types', () => {
  it('module exports core types', async () => {
    const mod = await import('./scheduling')
    // Type-only exports — verify module loads without error
    expect(mod).toBeDefined()
  })
})
