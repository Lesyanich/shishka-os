// Smoke test — TODO(brain-view): expand once vitest + RTL are installed.
import { describe, it, expect } from 'vitest'
import { GraphFilters } from '../GraphFilters'

describe('GraphFilters', () => {
  it('exports a function component', () => {
    expect(typeof GraphFilters).toBe('function')
  })
})
