import { describe, expect, it } from 'vitest'
import { DAY_1_CATEGORIES, readinessSummary } from '../dishes-config'

describe('DishAccordion', () => {
  it('exports DishAccordion component', async () => {
    const mod = await import('../DishAccordion')
    expect(typeof mod.DishAccordion).toBe('function')
  })

  it('ships exactly 12 dishes across 6 categories', () => {
    expect(DAY_1_CATEGORIES).toHaveLength(6)
    const total = DAY_1_CATEGORIES.reduce((sum, c) => sum + c.dishes.length, 0)
    expect(total).toBe(12)
  })

  it('Manaeesh and Mains default to open', () => {
    const openByDefault = DAY_1_CATEGORIES.filter((c) => c.defaultOpen).map(
      (c) => c.name,
    )
    expect(openByDefault).toEqual(['Manaeesh', 'Mains'])
  })

  describe('readinessSummary', () => {
    it('labels fully-locked as full', () => {
      const r = readinessSummary([
        { code: '1', name: 'a', lock: 'locked' },
        { code: '2', name: 'b', lock: 'locked' },
      ])
      expect(r.kind).toBe('full')
      expect(r.label).toBe('2/2 LOCKED')
    })

    it('labels mixed as partial', () => {
      const r = readinessSummary([
        { code: '1', name: 'a', lock: 'locked' },
        { code: '2', name: 'b', lock: 'tuning' },
      ])
      expect(r.kind).toBe('partial')
    })

    it('labels none-locked as open', () => {
      const r = readinessSummary([
        { code: '1', name: 'a', lock: 'open' },
        { code: '2', name: 'b', lock: 'tuning' },
      ])
      expect(r.kind).toBe('open')
      expect(r.label).toBe('0/2 LOCKED')
    })
  })
})
