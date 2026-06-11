import { describe, it, expect } from 'vitest'
import type { DishModifierOption } from '../../../../hooks/useMenuListEnrichment'
import {
  groupModifierOptions,
  groupSelectedCount,
  selectedTotals,
  requiredFloorExtra,
  requiredMet,
} from './ModifierBuildPreview'

function opt(p: Partial<DishModifierOption>): DishModifierOption {
  return {
    dish_id: 'd1',
    group_name: 'Pick Fruits',
    modifier_name: 'X',
    modifier_short_name: null,
    modifier_emoji: null,
    price_delta: 0,
    is_default: false,
    modifier_stock_state: 'in_stock',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    group_min_select: 2,
    group_max_select: 4,
    ...p,
  }
}

// Mirrors the Custom Smoothie "Pick Fruits" group (min 2, max 4).
const FRUITS: DishModifierOption[] = [
  opt({ modifier_name: 'Banana', price_delta: 10, calories: 67, protein: 0.8, carbs: 17.1, fat: 0.2 }),
  opt({ modifier_name: 'Pineapple', price_delta: 10, calories: 38, protein: 0.4, carbs: 9.8, fat: 0.1 }),
  opt({ modifier_name: 'Avocado', price_delta: 25, calories: 120, protein: 1.5, carbs: 6.4, fat: 11 }),
]

describe('groupModifierOptions', () => {
  it('groups by name and carries min/max + stable keys', () => {
    const groups = groupModifierOptions(FRUITS)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: 'Pick Fruits', minSelect: 2, maxSelect: 4 })
    expect(groups[0].options.map((o) => o.key)).toEqual(['0:0', '0:1', '0:2'])
  })

  it('preserves multiple groups in input order with their own bounds', () => {
    const groups = groupModifierOptions([
      opt({ group_name: 'Boosters', group_min_select: 0, group_max_select: null, price_delta: 40 }),
      ...FRUITS,
    ])
    expect(groups.map((g) => g.name)).toEqual(['Boosters', 'Pick Fruits'])
    expect(groups[0]).toMatchObject({ minSelect: 0, maxSelect: null })
    expect(groups[1].options.map((o) => o.key)).toEqual(['1:0', '1:1', '1:2'])
  })
})

describe('selectedTotals', () => {
  it('sums nutrition + price of selected options only', () => {
    const groups = groupModifierOptions(FRUITS)
    const totals = selectedTotals(groups, new Set(['0:0', '0:2'])) // Banana + Avocado
    expect(totals.count).toBe(2)
    expect(totals.priceExtra).toBe(35)
    expect(totals.calories).toBe(187)
    expect(totals.protein).toBeCloseTo(2.3, 5)
    expect(totals.fat).toBeCloseTo(11.2, 5)
  })

  it('is zero when nothing is selected', () => {
    const groups = groupModifierOptions(FRUITS)
    expect(selectedTotals(groups, new Set())).toMatchObject({ count: 0, calories: 0, priceExtra: 0 })
  })
})

describe('requiredFloorExtra', () => {
  it('uses the cheapest min picks of each required group', () => {
    // min 2 cheapest fruits = 10 + 10 = 20
    expect(requiredFloorExtra(groupModifierOptions(FRUITS))).toBe(20)
  })

  it('ignores groups with no minimum', () => {
    const groups = groupModifierOptions([
      opt({ group_name: 'Boosters', group_min_select: 0, group_max_select: null, price_delta: 40 }),
    ])
    expect(requiredFloorExtra(groups)).toBe(0)
  })
})

describe('requiredMet', () => {
  it('is false below the minimum, true at or above', () => {
    const groups = groupModifierOptions(FRUITS)
    expect(requiredMet(groups, new Set(['0:0']))).toBe(false)
    expect(requiredMet(groups, new Set(['0:0', '0:1']))).toBe(true)
  })
})

describe('groupSelectedCount', () => {
  it('counts only the keys in that group', () => {
    const groups = groupModifierOptions(FRUITS)
    expect(groupSelectedCount(groups[0], new Set(['0:0', '0:1']))).toBe(2)
    expect(groupSelectedCount(groups[0], new Set())).toBe(0)
  })
})
