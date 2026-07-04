import { describe, expect, it } from 'vitest'
import { CountZoneBar } from './CountZoneBar'

// Zone math is covered in src/types/stations.test.ts (countStatus, zoneBarFill).
describe('CountZoneBar', () => {
  it('exports a component function', () => {
    expect(typeof CountZoneBar).toBe('function')
    expect(CountZoneBar.name).toBe('CountZoneBar')
  })
})
