import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isPackagingCategoryCode } from '../lib/packaging'

export interface BomIngredient {
  ingredient_id: string
  product_code: string
  name: string
  /** Clean cook/customer-facing name (no brand or pack size); falls back to `name`. */
  customer_short_name: string | null
  type: string
  quantity: number
  base_unit: string | null
}

export interface UseBomIngredientsResult {
  ingredients: BomIngredient[]
  isLoading: boolean
  error: string | null
}

export function useBomIngredients(parentId: string | null): UseBomIngredientsResult {
  const [ingredients, setIngredients] = useState<BomIngredient[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!parentId) {
      setIngredients([])
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('bom_structures')
      .select('ingredient_id, quantity_per_unit, nomenclature!bom_structures_ingredient_id_fkey(product_code, name, customer_short_name, type, base_unit, product_categories!category_id(code))')
      .eq('parent_id', parentId)
      // bom_structures has no `sort_order` column; ordering by `created_at`
      // matches the pattern used in useDishDetail and gives stable, insertion-
      // ordered results.
      .order('created_at', { ascending: true })
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }
    const mapped: BomIngredient[] = ((data ?? []) as Record<string, unknown>[])
      // Packaging (NF-PKG subtree) lives in BOM for cost, but is not a cook
      // ingredient — exclude it from the cook's ingredient list.
      .filter((r) => {
        const n = r.nomenclature as { product_categories?: { code?: string | null } | null } | null
        return !isPackagingCategoryCode(n?.product_categories?.code)
      })
      .map((r) => {
        const n = r.nomenclature as { product_code: string; name: string; customer_short_name: string | null; type: string; base_unit: string | null } | null
        return {
          ingredient_id: r.ingredient_id as string,
          product_code: n?.product_code ?? '',
          name: n?.name ?? '',
          customer_short_name: n?.customer_short_name ?? null,
          type: n?.type ?? '',
          quantity: r.quantity_per_unit as number,
          base_unit: n?.base_unit ?? null,
        }
      })
    setIngredients(mapped)
    setIsLoading(false)
  }, [parentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ingredients, isLoading, error }
}
