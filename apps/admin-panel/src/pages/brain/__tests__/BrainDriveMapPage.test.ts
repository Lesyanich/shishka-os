// Smoke test — module imports and exports the named component.
import { describe, it, expect } from 'vitest'
import { BrainDriveMapPage } from '../BrainDriveMapPage'

describe('BrainDriveMapPage', () => {
  it('exports a function component', () => {
    expect(typeof BrainDriveMapPage).toBe('function')
  })
})
