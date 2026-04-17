import { describe, it, expect } from 'vitest'

describe('useNomenclatureImages', () => {
  it('exports hook and NomImage type', async () => {
    const mod = await import('./useNomenclatureImages')
    expect(mod.useNomenclatureImages).toBeDefined()
    expect(typeof mod.useNomenclatureImages).toBe('function')
  })
})
