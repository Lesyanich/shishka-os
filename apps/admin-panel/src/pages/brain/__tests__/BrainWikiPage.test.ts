// Smoke test — module imports and exports the named component.
// TODO(brain-view): expand with @testing-library/react render assertions
// once we have a fixture for vault.json fetch.
import { describe, it, expect } from 'vitest'
import { BrainWikiPage } from '../BrainWikiPage'

describe('BrainWikiPage', () => {
  it('exports a function component', () => {
    expect(typeof BrainWikiPage).toBe('function')
  })
})
