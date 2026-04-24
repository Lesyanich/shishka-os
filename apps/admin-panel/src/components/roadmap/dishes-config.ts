/**
 * Day-1 menu for the Phase-0 dish accordion.
 *
 * Hardcoded from the designer's v1.3 prototype until a real wiring to
 * `nomenclature` + `product_categories` + the `day-1-menu` tag ships
 * (follow-up task — see Opening Roadmap §9 data model).
 */

export type DishLock = 'locked' | 'tuning' | 'open'

export interface DishPreview {
  /** Matches `nomenclature.product_code` suffix for /menu#dish-NN deep-link. */
  code: string
  name: string
  /** Short italic note shown next to the name for tuning/open dishes. */
  note?: string
  lock: DishLock
}

export interface DishCategory {
  name: string
  dishes: readonly DishPreview[]
  /** Whether the category is open by default on first render. */
  defaultOpen: boolean
}

export const DAY_1_CATEGORIES: readonly DishCategory[] = [
  {
    name: 'Manaeesh',
    defaultOpen: true,
    dishes: [
      { code: '01', name: "Za'atar Manaeesh", lock: 'locked' },
      { code: '02', name: 'Cheese Manaeesh', lock: 'locked' },
    ],
  },
  {
    name: 'Mains',
    defaultOpen: true,
    dishes: [
      { code: '03', name: 'Shakshuka', note: 'tuning portioning', lock: 'tuning' },
      {
        code: '04',
        name: 'Chicken Shawarma Bowl',
        note: 'salinity −8%',
        lock: 'tuning',
      },
      { code: '07', name: 'Kibbeh', lock: 'locked' },
    ],
  },
  {
    name: 'Mezze & Salads',
    defaultOpen: false,
    dishes: [
      { code: '05', name: 'Hummus Plate', lock: 'locked' },
      { code: '06', name: 'Fattoush', lock: 'locked' },
      { code: '09', name: 'Baba Ghanoush', note: 'smoke depth', lock: 'tuning' },
      { code: '10', name: 'Tabbouleh', lock: 'locked' },
    ],
  },
  {
    name: 'Soups',
    defaultOpen: false,
    dishes: [{ code: '08', name: 'Lentil Soup', lock: 'locked' }],
  },
  {
    name: 'Desserts',
    defaultOpen: false,
    dishes: [{ code: '11', name: 'Baklava', lock: 'locked' }],
  },
  {
    name: 'Drinks',
    defaultOpen: false,
    dishes: [
      {
        code: '12',
        name: 'Mint Lemonade',
        note: 'supplier pending',
        lock: 'open',
      },
    ],
  },
] as const

export function readinessSummary(
  dishes: readonly DishPreview[],
): { label: string; kind: 'full' | 'partial' | 'open' } {
  const locked = dishes.filter((d) => d.lock === 'locked').length
  const total = dishes.length
  const kind: 'full' | 'partial' | 'open' =
    locked === total ? 'full' : locked === 0 ? 'open' : 'partial'
  return { label: `${locked}/${total} LOCKED`, kind }
}
