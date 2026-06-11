import { describe, it, expect } from 'vitest'

describe('SaladBarEditor', () => {
  it('module exports SaladBarEditorUnit and COLOR_MAP', async () => {
    const mod = await import('./SaladBarEditor')
    expect(mod.SaladBarEditorUnit).toBeDefined()
    expect(mod.COLOR_MAP).toBeDefined()
  })
})
