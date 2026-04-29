// Smoke test — module imports and exports the named component.
import { describe, it, expect } from 'vitest'
import { GraphCanvas } from '../GraphCanvas'

describe('GraphCanvas', () => {
  it('exports a function component', () => {
    expect(typeof GraphCanvas).toBe('function')
  })
})
