import { describe, it, expect } from 'vitest'

describe('AllergenBadges', () => {
  it('exports AllergenBadges component', async () => {
    const mod = await import('./AllergenBadges')
    expect(mod.AllergenBadges).toBeDefined()
  })
})
