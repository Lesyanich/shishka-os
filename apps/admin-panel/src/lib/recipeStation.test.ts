import { describe, it, expect } from 'vitest'
import { stationForLocation, bucketStepsByStation } from './recipeStation'

describe('stationForLocation', () => {
  it('maps Kitchen and Storage to L1', () => {
    expect(stationForLocation('Kitchen')).toBe('L1')
    expect(stationForLocation('Storage')).toBe('L1')
  })
  it('maps Assembly to L2', () => {
    expect(stationForLocation('Assembly')).toBe('L2')
  })
  it('returns null for null/unknown locations', () => {
    expect(stationForLocation(null)).toBeNull()
    expect(stationForLocation(undefined)).toBeNull()
    expect(stationForLocation('Bar')).toBeNull()
  })
})

describe('bucketStepsByStation', () => {
  const step = (location_name: string | null) => ({ location_name })

  it('splits a station-tagged manakish into L1 (Kitchen+Storage) and L2 (Assembly)', () => {
    const steps = [
      step('Kitchen'), // press
      step('Kitchen'), // pre-bake
      step('Kitchen'), // assemble topping
      step('Kitchen'), // blast freeze
      step('Storage'), // store
      step('Assembly'), // Merrychef bake
    ]
    const { l1, l2, tagged } = bucketStepsByStation(steps)
    expect(tagged).toBe(true)
    expect(l1).toHaveLength(5)
    expect(l2).toHaveLength(1)
  })

  it('reports untagged when no step carries a recognized station (legacy dishes)', () => {
    const { l1, l2, tagged } = bucketStepsByStation([step(null), step(null)])
    expect(tagged).toBe(false)
    expect(l2).toHaveLength(0)
    // null steps bucket into L1 so callers that ignore `tagged` still see them
    expect(l1).toHaveLength(2)
  })

  it('never drops a null/unknown step in a partially-tagged dish (buckets to L1)', () => {
    const { l1, l2, tagged } = bucketStepsByStation([
      step('Assembly'),
      step(null),
      step('Mystery'),
    ])
    expect(tagged).toBe(true)
    expect(l2).toHaveLength(1)
    expect(l1).toHaveLength(2) // null + unknown both fall back to prep
  })
})
