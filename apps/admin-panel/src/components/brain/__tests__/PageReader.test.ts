// Smoke test — module imports and exports the named component.
import { describe, it, expect } from 'vitest'
import { PageReader } from '../PageReader'

describe('PageReader', () => {
  it('exports a function component', () => {
    expect(typeof PageReader).toBe('function')
  })
})
