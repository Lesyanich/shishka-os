// Smoke test — module imports and exports the named component.
import { describe, it, expect } from 'vitest'
import { VaultSidebar } from '../VaultSidebar'

describe('VaultSidebar', () => {
  it('exports a function component', () => {
    expect(typeof VaultSidebar).toBe('function')
  })
})
