import { describe, it, expect } from 'vitest'

describe('RoleGuard', () => {
  it('exports RoleGuard component', async () => {
    const mod = await import('../RoleGuard')
    expect(mod.RoleGuard).toBeDefined()
  })
})
