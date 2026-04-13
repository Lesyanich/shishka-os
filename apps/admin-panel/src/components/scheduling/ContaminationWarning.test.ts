import { describe, it, expect } from 'vitest'

describe('ContaminationWarning', () => {
  it('module exports ContaminationWarning', async () => {
    const mod = await import('./ContaminationWarning')
    expect(mod.ContaminationWarning).toBeDefined()
  })
})
