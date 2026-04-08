// Smoke test — TODO(brain-view): expand once vitest + RTL are installed.
import { describe, it, expect } from 'vitest'
import { BrainPlaceholder } from '../BrainPlaceholder'

describe('BrainPlaceholder', () => {
  it('exports a function component', () => {
    expect(typeof BrainPlaceholder).toBe('function')
  })
})
