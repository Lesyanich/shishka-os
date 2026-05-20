import { useMemo } from 'react'
import type { MenuCategory, MenuDish } from '../../../hooks/useMenuDishes'
import type { DishCardData } from '../../../hooks/useDishCard'
import type {
  DishSummary,
  MenuCategorySummary,
} from '../../../components/menu/shared/types'
import {
  CategorySection,
  HeroHeader,
} from '../../../components/menu/customer'

interface CustomerPreviewProps {
  dishes: MenuDish[]
  categories: MenuCategory[]
  selectedCategory: string | null
  /** Per-dish allergen slugs (from BOM tree walk). */
  allergensByDishId?: Map<string, string[]>
  /** Per-dish dish_card row — contributes customer_eta_min. */
  dishCardById?: Map<string, DishCardData>
  /** Quality score lookup — wires when the scorecard sub-task lands. */
  qualityScoreFor?: (dishId: string) => number | null | undefined
  /** Click a dish → open DetailDrawer (owner-only). Public site leaves this
   * undefined so cards are non-interactive. */
  onOpenDish?: (dishId: string) => void
}

/** Adapter layer: translates admin-panel `MenuDish` rows into the pure
 * `DishSummary` shape consumed by `components/menu/customer/` so the
 * customer folder stays portable (zero admin-panel imports). When the
 * public shishka.health/menu site ships, customer/* lifts unchanged;
 * only this adapter stays behind in the admin repo. */
export function CustomerPreview({
  dishes,
  categories,
  selectedCategory,
  allergensByDishId,
  dishCardById,
  qualityScoreFor,
  onOpenDish,
}: CustomerPreviewProps) {
  const visible = useMemo(
    () => dishes.filter((d) => d.is_available && d.price && d.price > 0),
    [dishes],
  )

  const filtered = useMemo(
    () =>
      selectedCategory
        ? visible.filter((d) => d.category_id === selectedCategory)
        : visible,
    [visible, selectedCategory],
  )

  const categoryOfId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const d of filtered) map.set(d.id, d.category_id)
    return map
  }, [filtered])

  const descriptionOfId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const d of filtered) map.set(d.id, d.description)
    return map
  }, [filtered])

  const summaries = useMemo<DishSummary[]>(
    () =>
      filtered.map((d) => {
        const card = dishCardById?.get(d.id)
        return {
          id: d.id,
          name: d.name,
          description: d.description,
          price: d.price,
          portionSize: d.portion_size,
          portionUnit: d.portion_unit,
          imageUrl: d.image_url,
          isFeatured: d.is_featured,
          nutrition: {
            calories: d.calories,
            protein: d.protein,
            carbs: d.carbs,
            fat: d.fat,
          },
          tags: d.tags
            // Strip allergen tags from chip strip — they render as their own row.
            .filter((t) => t.tag_group !== 'allergen')
            .map((t) => ({
              slug: t.slug,
              name: t.name,
              group: t.tag_group,
              color: t.color,
            })),
          allergens: allergensByDishId?.get(d.id) ?? [],
          etaMin: card?.customer_eta_min ?? null,
        }
      }),
    [filtered, allergensByDishId, dishCardById],
  )

  const categorySummaries = useMemo<MenuCategorySummary[]>(
    () =>
      categories.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
    [categories],
  )

  if (summaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[color:var(--color-cream)]/50">
        No dishes available in this category.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <HeroHeader />
      <CategorySection
        categories={categorySummaries}
        dishes={summaries}
        categoryOf={(id) => categoryOfId.get(id) ?? null}
        descriptionFor={(id) => descriptionOfId.get(id) ?? null}
        qualityScoreFor={qualityScoreFor}
        onSelect={onOpenDish}
        stickyTopPx={64}
      />
    </div>
  )
}
