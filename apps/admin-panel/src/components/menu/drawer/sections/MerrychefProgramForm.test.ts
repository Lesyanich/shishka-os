import { describe, it, expect } from 'vitest'

describe('MerrychefProgramForm', () => {
  it('exports MerrychefProgramForm component', async () => {
    const mod = await import('./MerrychefProgramForm')
    expect(mod.MerrychefProgramForm).toBeDefined()
  })
})
