import { describe, it, expect } from 'vitest'
import { dietCheckPresentation } from './dietCheck'
import type { DishDietCheck } from './dietCheck'

const row = (over: Partial<DishDietCheck>): DishDietCheck => ({
  dish_id: 'd1',
  product_code: 'SALE-X',
  needs_check: true,
  reason: 'never_reviewed',
  ready: false,
  unconfirmed: 2,
  soft_deleted: 0,
  ingredients: 5,
  proposed_diets: null,
  published_diets: [],
  diet_reviewed_at: null,
  diet_reviewed_by: null,
  ...over,
})

describe('shared/dietCheck', () => {
  it('renders nothing before the view answers', () => {
    expect(dietCheckPresentation(null)).toBeNull()
    expect(dietCheckPresentation(undefined)).toBeNull()
  })

  it('marks a confirmed dish as shown to guests', () => {
    const p = dietCheckPresentation(
      row({ needs_check: false, reason: 'ok', ready: true, published_diets: ['plant-based', 'vegetarian'] }),
    )
    expect(p?.label).toBe('diet ✓')
    expect(p?.detail).toContain('plant-based + vegetarian')
  })

  it('says "check tags" and "hidden" for a dish whose composition changed', () => {
    const p = dietCheckPresentation(
      row({ reason: 'composition_changed', published_diets: ['vegetarian'] }),
    )
    expect(p?.label).toBe('check tags')
    expect(p?.detail).toContain('hidden from guests')
    expect(p?.detail).toContain('vegetarian')
  })

  it('offers the one-click confirm when every ingredient is classified', () => {
    const p = dietCheckPresentation(row({ ready: true, unconfirmed: 0, proposed_diets: ['vegetarian'] }))
    expect(p?.label).toBe('diet: ready')
    expect(p?.detail).toContain('vegetarian')
  })

  it('counts what blocks an unreviewed dish, including retired ingredients', () => {
    const p = dietCheckPresentation(row({ unconfirmed: 3, soft_deleted: 1 }))
    expect(p?.label).toBe('diet: 3 to do')
    expect(p?.detail).toContain('retired ingredient')
  })
})
