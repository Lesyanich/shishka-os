import { z } from 'zod'

/**
 * Customer-safe menu shapes. These mirror the portable `DishSummary` shape used
 * by apps/admin-panel/src/components/menu/shared/types.ts so the existing menu
 * components render unchanged on the public site.
 *
 * IMPORTANT: nothing here exposes cost_per_unit, markup_pct, suppliers, or BOM.
 * The public site reads these fields from the `v_public_menu` view (migration 222),
 * never from the raw nomenclature row.
 */

export const portionUnitSchema = z.enum(['g', 'ml', 'pcs'])
export type PortionUnit = z.infer<typeof portionUnitSchema>

export const menuTagSchema = z.object({
  slug: z.string(),
  name: z.string(),
  group: z.string().nullish(),
  color: z.string().nullish(),
})
export type MenuTag = z.infer<typeof menuTagSchema>

export const menuCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
})
export type MenuCategory = z.infer<typeof menuCategorySchema>

export const nutritionSchema = z.object({
  calories: z.number().nullable(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  fiber: z.number().nullish(),
})
export type Nutrition = z.infer<typeof nutritionSchema>

export const dishModifierSchema = z.object({
  slug: z.string(),
  name: z.string(),
  priceDelta: z.number(),
  isDefault: z.boolean(),
})
export type DishModifier = z.infer<typeof dishModifierSchema>

/** The customer-facing dish. Field names match the admin-panel DishSummary. */
export const dishSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullish(),
  price: z.number().nullable(),
  portionSize: z.number().nullable(),
  portionUnit: portionUnitSchema.nullable(),
  imageUrl: z.string().nullable(),
  isFeatured: z.boolean(),
  nutrition: nutritionSchema,
  tags: z.array(menuTagSchema),
  /** Allergen slugs, e.g. ['allergen-dairy']. */
  allergens: z.array(z.string()).optional(),
  /** Customer-facing wait estimate (minutes). */
  etaMin: z.number().nullish(),
  modifiers: z.array(dishModifierSchema).optional(),
})
export type Dish = z.infer<typeof dishSchema>
