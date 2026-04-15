import { describe, it, expect } from 'vitest'
import { DataHealthTab } from './DataHealthTab'

// Smoke: component is exported and is a function.
describe('DataHealthTab', () => {
  it('exports a component', () => {
    expect(typeof DataHealthTab).toBe('function')
  })
})
