// Smoke test — module imports and exports the named component.
// TODO(brain-view): install vitest + @testing-library/react in admin-panel and add render assertions.
import { describe, it, expect } from 'vitest'
import { BrainPage } from '../BrainPage'

describe('BrainPage', () => {
  it('exports a function component', () => {
    expect(typeof BrainPage).toBe('function')
  })
})
