// Smoke test — TODO(brain-view): expand once vitest + RTL are installed.
import { describe, it, expect } from 'vitest'
import { NodeDetailPanel } from '../NodeDetailPanel'

describe('NodeDetailPanel', () => {
  it('exports a function component', () => {
    expect(typeof NodeDetailPanel).toBe('function')
  })
})
