import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export interface ProductCategory {
  id: string
  code: string
  name: string
  parent_id: string | null
  level: number
  sort_order: number
}

/**
 * The product category tree, loaded once.
 *
 * Shape in prod: level 1 = Food / Non-Food / Kitchen Production (3 rows),
 * level 2 = the working categories a human thinks in — Produce, Proteins,
 * Dairy & Fats … (23), level 3 = subcategories (114). Items hang off level 3
 * in most cases, sometimes off level 2.
 *
 * So the filter pair the CEO asked for maps to: category = level 2,
 * subcategory = level 3.
 */
export function useProductCategories() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('product_categories')
      .select('id, code, name, parent_id, level, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return
        setCategories((data ?? []) as ProductCategory[])
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  /** Level-2 categories, the ones worth putting in a picker. */
  const mainCategories = useMemo(
    () => categories.filter((c) => c.level === 2),
    [categories],
  )

  const subCategoriesOf = useMemo(
    () => (parentId: string | null) =>
      parentId ? categories.filter((c) => c.parent_id === parentId) : [],
    [categories],
  )

  /**
   * "Produce · Vegetables" for a leaf, "Produce" for a level-2 id.
   * Used as the readable label wherever a raw product_code would otherwise be
   * shown — codes like RAW-AUTO-0b4e881a tell a human nothing.
   */
  const pathOf = useMemo(
    () => (categoryId: string | null): string | null => {
      if (!categoryId) return null
      const cat = byId.get(categoryId)
      if (!cat) return null
      const parent = cat.parent_id ? byId.get(cat.parent_id) : null
      // Skip level-1 roots in the path: "Food · Produce · Vegetables" is noise.
      if (parent && parent.level >= 2) return `${parent.name} · ${cat.name}`
      return cat.name
    },
    [byId],
  )

  /** The level-2 ancestor of any category, so a leaf can be matched to a filter. */
  const mainCategoryIdOf = useMemo(
    () => (categoryId: string | null): string | null => {
      if (!categoryId) return null
      const cat = byId.get(categoryId)
      if (!cat) return null
      if (cat.level === 2) return cat.id
      if (cat.parent_id) {
        const parent = byId.get(cat.parent_id)
        if (parent?.level === 2) return parent.id
      }
      return null
    },
    [byId],
  )

  return { categories, mainCategories, subCategoriesOf, pathOf, mainCategoryIdOf, byId, isLoading }
}
