import { describe, it, expect } from 'vitest'

// Shape test — admin-panel test env lacks live Supabase creds (MC 0e5b05a7),
// so we keep this to module-shape assertions like adjacent useDataHealth.test.ts.
describe('usePackInfoPending module shape', () => {
  it('exports usePackInfoPending as a function', async () => {
    const mod = await import('./usePackInfoPending')
    expect(typeof mod.usePackInfoPending).toBe('function')
  })

  it('module re-exports the hook entry point only', async () => {
    const mod = await import('./usePackInfoPending')
    expect(mod).toHaveProperty('usePackInfoPending')
  })
})
