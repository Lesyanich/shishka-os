import { describe, it, expect } from 'vitest'
import { stationForLocationType, bucketStepsByStation } from './recipeStation'

describe('stationForLocationType', () => {
  it('maps kitchen and storage to L1', () => {
    expect(stationForLocationType('kitchen')).toBe('L1')
    expect(stationForLocationType('storage')).toBe('L1')
  })
  it('maps assembly to L2', () => {
    expect(stationForLocationType('assembly')).toBe('L2')
  })
  it('returns null for null/unknown types', () => {
    expect(stationForLocationType(null)).toBeNull()
    expect(stationForLocationType(undefined)).toBeNull()
    expect(stationForLocationType('bar')).toBeNull()
  })
})

describe('bucketStepsByStation', () => {
  const step = (location_type: string | null) => ({ location_type })

  it('splits a station-tagged manakish into L1 (kitchen+storage) and L2 (assembly)', () => {
    const steps = [
      step('kitchen'), // press
      step('kitchen'), // pre-bake
      step('kitchen'), // assemble topping
      step('kitchen'), // blast freeze
      step('storage'), // store
      step('assembly'), // Merrychef bake
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
      step('assembly'),
      step(null),
      step('mystery'),
    ])
    expect(tagged).toBe(true)
    expect(l2).toHaveLength(1)
    expect(l1).toHaveLength(2) // null + unknown both fall back to prep
  })
})
