// Smoke test — module imports and exports the named component.
import { describe, it, expect } from 'vitest'
import { BrainExplorePage } from '../BrainExplorePage'

describe('BrainExplorePage', () => {
  it('exports a function component', () => {
    expect(typeof BrainExplorePage).toBe('function')
  })
})
