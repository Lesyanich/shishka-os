import { describe, it, expect } from 'vitest'
import { parseFiltersFromParams, serializeFilters, applyFilters, type FilteredItem } from './useMenuFilters'

const item = (over: Partial<FilteredItem> = {}): FilteredItem => ({
  id: 'i1',
  category_id: 'c1',
  is_available: true,
  loyverse_id: 'lv-1',
  image_url: 'http://x/y.jpg',
  calories: 100,
  price: 89,
  hasBom: true,
  ...over,
})

describe('parseFiltersFromParams', () => {
  it('returns empty defaults when no params', () => {
    const f = parseFiltersFromParams(new URLSearchParams(''))
    expect(f).toEqual({ categoryIds: [], available: null, loyverse: null, flags: [] })
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
    expect(f.available).toBeNull()
    expect(f.flags).toEqual([])
  })
})

describe('serializeFilters', () => {
  it('omits empty values for clean URLs', () => {
    const out = serializeFilters({ categoryIds: [], available: null, loyverse: null, flags: [] })
    expect(out).toEqual({ cat: null, available: null, loyverse: null, flags: null })
  })

  it('joins multi values with comma', () => {
    const out = serializeFilters({ categoryIds: ['c1', 'c2'], available: 'yes', loyverse: 'synced', flags: ['no-photo'] })
    expect(out.cat).toBe('c1,c2')
    expect(out.flags).toBe('no-photo')
  })
})

describe('applyFilters', () => {
  it('returns all when no filter active', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    expect(applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: [] })).toHaveLength(2)
  })

  it('cat = OR within group', () => {
    const items = [item({ id: 'a', category_id: 'c1' }), item({ id: 'b', category_id: 'c2' }), item({ id: 'c', category_id: 'c3' })]
    const out = applyFilters(items, { categoryIds: ['c1', 'c2'], available: null, loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('item with null category_id is excluded when cat filter is active', () => {
    const items = [item({ id: 'a', category_id: 'c1' }), item({ id: 'b', category_id: null })]
    const out = applyFilters(items, { categoryIds: ['c1'], available: null, loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('available=yes filters out unavailable', () => {
    const items = [item({ id: 'a', is_available: true }), item({ id: 'b', is_available: false })]
    const out = applyFilters(items, { categoryIds: [], available: 'yes', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('loyverse=unsynced filters to null loyverse_id', () => {
    const items = [item({ id: 'a', loyverse_id: 'lv-1' }), item({ id: 'b', loyverse_id: null })]
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: 'unsynced', flags: [] })
    expect(out.map((i) => i.id)).toEqual(['b'])
  })

  it('flags OR within group', () => {
    const items = [
      item({ id: 'a', image_url: null }),            // no-photo
      item({ id: 'b', calories: null }),             // no-kbju
      item({ id: 'c' }),                              // matches neither
    ]
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: ['no-photo', 'no-kbju'] })
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
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: ['draft'] })
    expect(out.map((i) => i.id)).toEqual(['b', 'c'])
  })
})
