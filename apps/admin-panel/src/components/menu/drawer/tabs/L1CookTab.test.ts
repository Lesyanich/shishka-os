import { describe, it, expect } from 'vitest'

describe('L1CookTab', () => {
  it('exports L1CookTab component', async () => {
    const mod = await import('./L1CookTab')
    expect(mod.L1CookTab).toBeDefined()
  })

  it('exports L1CookTabProps type', async () => {
    const mod = await import('./L1CookTab')
    expect(typeof mod.L1CookTab).toBe('function')
  })
})
