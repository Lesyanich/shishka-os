import { describe, it, expect } from 'vitest'
import { FIXED_LINKS, buildDishLink, recipeStationParam } from './taskLinks'

describe('taskLinks', () => {
  it('maps station to the cook recipe tab', () => {
    expect(recipeStationParam('L2')).toBe('l2-assembler')
    expect(recipeStationParam('L1')).toBe('l1-cook')
    expect(recipeStationParam('general')).toBe('l1-cook')
  })

  it('builds a cook-reachable dish recipe deep link', () => {
    const link = buildDishLink('SALE-HUMMUS', 'Hummus', 'L1')
    expect(link.route).toBe('/kitchen/recipes?dish=SALE-HUMMUS&station=l1-cook')
    expect(link.label).toBe('Recipe: Hummus')
    expect(link.label_th).toContain('Hummus')
  })

  it('opens the assembler tab for L2 tasks and url-encodes the code', () => {
    const link = buildDishLink('PF-DOUGH BASE', 'Dough', 'L2', 'แป้ง')
    expect(link.route).toBe('/kitchen/recipes?dish=PF-DOUGH%20BASE&station=l2-assembler')
    expect(link.label_th).toBe('สูตร: แป้ง')
  })

  it('exposes only cook-reachable fixed pages', () => {
    const routes = FIXED_LINKS.map((f) => f.route)
    expect(routes).toContain('/stock')
    expect(routes).toContain('/kitchen/waste')
    expect(routes).toContain('/kitchen/labels')
    expect(routes).toContain('/receive')
    // Every fixed link carries both an English and a Thai label.
    for (const f of FIXED_LINKS) {
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.label_th.length).toBeGreaterThan(0)
    }
  })

  it('offers per-station count deep links (S3)', () => {
    const countLinks = FIXED_LINKS.filter((f) => f.route.startsWith('/count/'))
    expect(countLinks.length).toBeGreaterThanOrEqual(5)
    // Each points at a concrete station code the StationCountPage can resolve
    // (/count/:code, cook-reachable) and carries a Thai label.
    for (const f of countLinks) {
      expect(f.route).toMatch(/^\/count\/[a-z-]+$/)
      expect(f.label_th.length).toBeGreaterThan(0)
      expect(f.id.startsWith('count-')).toBe(true)
    }
    expect(FIXED_LINKS.map((f) => f.route)).toContain('/count/salad-bar')
  })
})
