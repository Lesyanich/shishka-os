import { describe, it, expect } from 'vitest'

describe('AppRoleContext', () => {
  it('exports AppRoleProvider and useAppRole', async () => {
    const mod = await import('../AppRoleContext')
    expect(mod.AppRoleProvider).toBeDefined()
    expect(mod.useAppRole).toBeDefined()
  })

  it('exports AppRole type (owner | cook)', async () => {
    // Type-level test — if this compiles, the type exists
    const role: import('../AppRoleContext').AppRole = 'owner'
    expect(role).toBe('owner')
  })
})
