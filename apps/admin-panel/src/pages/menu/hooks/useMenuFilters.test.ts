import { describe, it, expect } from 'vitest'
import {
  parseFiltersFromParams,
  serializeFilters,
  applyFilters,
  isNonDefault,
  defaultFilters,
  type FilteredItem,
} from './useMenuFilters'

const item = (over: Partial<FilteredItem> = {}): FilteredItem => ({
  id: 'i1',
  category_id: 'c1',
  is_available: true,
  loyverse_item_id: 'lv-1',
  image_url: 'http://x/y.jpg',
  calories: 100,
  price: 89,
  hasBom: true,
  ...over,
})

describe('parseFiltersFromParams', () => {
  it('defaults to available-only when no params', () => {
    const f = parseFiltersFromParams(new URLSearchParams(''))
    expect(f).toEqual({ categoryIds: [], available: 'yes', loyverse: null, flags: [] })
  })

  it('available=all opts back into retired dishes', () => {
    expect(parseFiltersFromParams(new URLSearchParams('available=all')).available).toBe('all')
  })

  it('available=no keeps the unavailable-only view', () => {
    expect(parseFiltersFromParams(new URLSearchParams('available=no')).available).toBe('no')
  })

  it('parses single cat (back-compat)', () => {
    const f = parseFiltersFromParams(new URLSearchParams('cat=c1'))
    expect(f.categoryIds).toEqual(['c1'])
  })

  it('parses comma-separated cats', () => {
    const f = parseFiltersFromParams(new URLSearchParams('cat=c1,c2,c3'))
    expect(f.categoryIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('parses available + loyverse + flags', () => {
    const f = parseFiltersFromParams(new URLSearchParams('available=yes&loyverse=unsynced&flags=no-photo,draft'))
    expect(f.available).toBe('yes')
    expect(f.loyverse).toBe('unsynced')
    expect(f.flags).toEqual(['no-photo', 'draft'])
  })

  it('ignores unknown values', () => {
    const f = parseFiltersFromParams(new URLSearchParams('available=maybe&flags=junk'))
    expect(f.available).toBe('yes')
    expect(f.flags).toEqual([])
  })
})

describe('serializeFilters', () => {
  it('omits empty values (and the default availability) for clean URLs', () => {
    const out = serializeFilters(defaultFilters())
    expect(out).toEqual({ cat: null, available: null, loyverse: null, flags: null })
  })

  it('round-trips available=all so the opt-in survives a refresh', () => {
    const f = { ...defaultFilters(), available: 'all' as const }
    expect(serializeFilters(f).available).toBe('all')
    expect(parseFiltersFromParams(new URLSearchParams('available=all'))).toEqual(f)
  })

  it('joins multi values with comma', () => {
    const out = serializeFilters({ categoryIds: ['c1', 'c2'], available: 'yes', loyverse: 'synced', flags: ['no-photo'] })
    expect(out.cat).toBe('c1,c2')
    expect(out.flags).toBe('no-photo')
  })
})

describe('applyFilters', () => {
  it('returns all when no filter active', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', is_available: false })]
    expect(applyFilters(items, { categoryIds: [], available: 'all', loyverse: null, flags: [] })).toHaveLength(2)
  })

  it('the page default hides unavailable (retired) dishes', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', is_available: false })]
    const out = applyFilters(items, defaultFilters())
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('cat = OR within group', () => {
    const items = [item({ id: 'a', category_id: 'c1' }), item({ id: 'b', category_id: 'c2' }), item({ id: 'c', category_id: 'c3' })]
    const out = applyFilters(items, { categoryIds: ['c1', 'c2'], available: 'all', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('item with null category_id is excluded when cat filter is active', () => {
    const items = [item({ id: 'a', category_id: 'c1' }), item({ id: 'b', category_id: null })]
    const out = applyFilters(items, { categoryIds: ['c1'], available: 'all', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('available=yes filters out unavailable', () => {
    const items = [item({ id: 'a', is_available: true }), item({ id: 'b', is_available: false })]
    const out = applyFilters(items, { categoryIds: [], available: 'yes', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('flags=diet-check keeps only dishes whose diet tags await a person (mig 513)', () => {
    const waiting = item({ id: 'a', dietNeedsCheck: true })
    const done = item({ id: 'b', dietNeedsCheck: false })
    const unknown = item({ id: 'c' })
    const f = parseFiltersFromParams(new URLSearchParams('flags=diet-check'))
    expect(f.flags).toEqual(['diet-check'])
    expect(applyFilters([waiting, done, unknown], f).map((i) => i.id)).toEqual(['a'])
  })

  it('loyverse=unsynced filters to null loyverse_item_id', () => {
    const items = [item({ id: 'a', loyverse_item_id: 'lv-1' }), item({ id: 'b', loyverse_item_id: null })]
    const out = applyFilters(items, { categoryIds: [], available: 'all', loyverse: 'unsynced', flags: [] })
    expect(out.map((i) => i.id)).toEqual(['b'])
  })

  it('flags OR within group', () => {
    const items = [
      item({ id: 'a', image_url: null }),            // no-photo
      item({ id: 'b', calories: null }),             // no-kbju
      item({ id: 'c' }),                              // matches neither
    ]
    const out = applyFilters(items, { categoryIds: [], available: 'all', loyverse: null, flags: ['no-photo', 'no-kbju'] })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('AND across groups', () => {
    const items = [
      item({ id: 'a', category_id: 'c1', is_available: true }),
      item({ id: 'b', category_id: 'c1', is_available: false }),
      item({ id: 'c', category_id: 'c2', is_available: true }),
    ]
    const out = applyFilters(items, { categoryIds: ['c1'], available: 'yes', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('draft flag matches null/zero price', () => {
    const items = [item({ id: 'a', price: 89 }), item({ id: 'b', price: null }), item({ id: 'c', price: 0 })]
    const out = applyFilters(items, { categoryIds: [], available: 'all', loyverse: null, flags: ['draft'] })
    expect(out.map((i) => i.id)).toEqual(['b', 'c'])
  })
})

describe('isNonDefault', () => {
  it('is false for the bare /menu filter set', () => {
    expect(isNonDefault(defaultFilters())).toBe(false)
  })

  it('is true once availability is widened or narrowed', () => {
    expect(isNonDefault({ ...defaultFilters(), available: 'all' })).toBe(true)
    expect(isNonDefault({ ...defaultFilters(), available: 'no' })).toBe(true)
  })
})
