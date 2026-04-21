export type PortionUnit = 'g' | 'ml' | 'pcs'

export interface MenuTagSummary {
  slug: string
  name: string
  group?: string | null
  color?: string | null
}

export interface MenuCategorySummary {
  id: string
  code: string
  name: string
}

export interface NutritionSummary {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber?: number | null
}

export interface DishSummary {
  id: string
  name: string
  description?: string | null
  price: number | null
  portionSize: number | null
  portionUnit: PortionUnit | null
  imageUrl: string | null
  isFeatured: boolean
  nutrition: NutritionSummary
  tags: MenuTagSummary[]
}

export const FOOD_COST_THRESHOLDS = {
  good: 30,
  warn: 45,
} as const

export type FoodCostTier = 'good' | 'warn' | 'bad'

export function foodCostTier(pct: number): FoodCostTier {
  if (pct < FOOD_COST_THRESHOLDS.good) return 'good'
  if (pct <= FOOD_COST_THRESHOLDS.warn) return 'warn'
  return 'bad'
}
