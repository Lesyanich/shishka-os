import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProductCategories } from './useProductCategories'

/**
 * The tree drives every category filter in procurement, so the mapping rules
 * are pinned here: which level counts as a "category", how a leaf resolves back
 * to its filterable ancestor, and what a human-readable path looks like.
 *
 * Prod shape (2026-07): level 1 = Food / Non-Food / Kitchen Production,
 * level 2 = the 23 working categories, level 3 = 114 subcategories.
 */

const rows = [
  { id: 'food', code: 'F', name: 'Food', parent_id: null, level: 1, sort_order: 1 },
  { id: 'produce', code: 'F-PRD', name: 'Produce', parent_id: 'food', level: 2, sort_order: 1 },
  { id: 'proteins', code: 'F-PRO', name: 'Proteins', parent_id: 'food', level: 2, sort_order: 2 },
  { id: 'veg', code: 'F-PRD-V', name: 'Vegetables', parent_id: 'produce', level: 3, sort_order: 1 },
  { id: 'herbs', code: 'F-PRD-H', name: 'Fresh Herbs', parent_id: 'produce', level: 3, sort_order: 2 },
  { id: 'sea', code: 'F-PRO-S', name: 'Seafood', parent_id: 'proteins', level: 3, sort_order: 1 },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  },
}))

async function load() {
  const { result } = renderHook(() => useProductCategories())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  return result
}

beforeEach(() => vi.clearAllMocks())

describe('useProductCategories', () => {
  it('offers level-2 rows as the pickable categories', async () => {
    const result = await load()
    expect(result.current.mainCategories.map((c) => c.name)).toEqual(['Produce', 'Proteins'])
  })

  it('returns only the children of the requested category', async () => {
    const result = await load()
    expect(result.current.subCategoriesOf('produce').map((c) => c.name)).toEqual([
      'Vegetables',
      'Fresh Herbs',
    ])
    expect(result.current.subCategoriesOf(null)).toEqual([])
  })

  it('builds a readable path without the level-1 root', async () => {
    // "Food · Produce · Vegetables" is noise — the root never disambiguates.
    const result = await load()
    expect(result.current.pathOf('veg')).toBe('Produce · Vegetables')
  })

  it('shows a level-2 category on its own', async () => {
    const result = await load()
    expect(result.current.pathOf('produce')).toBe('Produce')
  })

  it('has no path for an item without a category', async () => {
    const result = await load()
    expect(result.current.pathOf(null)).toBeNull()
  })

  it('resolves a leaf back to the category the filter uses', async () => {
    const result = await load()
    expect(result.current.mainCategoryIdOf('sea')).toBe('proteins')
  })

  it('treats a level-2 id as its own filter category', async () => {
    const result = await load()
    expect(result.current.mainCategoryIdOf('produce')).toBe('produce')
  })

  it('returns null for an unknown or missing category', async () => {
    const result = await load()
    expect(result.current.mainCategoryIdOf('nope')).toBeNull()
    expect(result.current.mainCategoryIdOf(null)).toBeNull()
  })
})
