import { describe, it, expect } from 'vitest'

// Shape test — admin-panel test env lacks live Supabase creds (MC 0e5b05a7),
// so we keep this to module-shape assertions like adjacent DataHealthTab.test.ts.
describe('PackInfoPendingSection module shape', () => {
  it('exports PackInfoPendingSection as a function (React component)', async () => {
    const mod = await import('./PackInfoPendingSection')
    expect(typeof mod.PackInfoPendingSection).toBe('function')
  })
})
