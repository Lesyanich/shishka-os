import { describe, expect, it } from 'vitest'
import { useStations } from './useStations'

describe('useStations', () => {
  it('exports a hook function', () => {
    expect(typeof useStations).toBe('function')
    expect(useStations.name).toBe('useStations')
  })
})
