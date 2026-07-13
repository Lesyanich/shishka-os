import { describe, expect, it } from 'vitest'
import { StationChecklistPanel } from './StationChecklistPanel'

describe('StationChecklistPanel', () => {
  it('exports a component function', () => {
    expect(typeof StationChecklistPanel).toBe('function')
    expect(StationChecklistPanel.name).toBe('StationChecklistPanel')
  })
})
