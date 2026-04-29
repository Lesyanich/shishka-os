// Smoke test — module imports and exports the named class.
import { describe, it, expect } from 'vitest'
import { BrainErrorBoundary } from '../BrainErrorBoundary'

describe('BrainErrorBoundary', () => {
  it('exports a class component', () => {
    expect(typeof BrainErrorBoundary).toBe('function')
    expect(BrainErrorBoundary.prototype.render).toBeDefined()
  })
})
