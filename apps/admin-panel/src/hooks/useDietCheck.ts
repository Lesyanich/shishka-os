import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DishDietCheck, DietCheckReason } from '../components/menu/shared/dietCheck'

export interface UseDietCheckResult {
  /** v_dish_diet_check row keyed by dish_id (SALE dishes only). */
  checkByDish: Map<string, DishDietCheck>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Diet-tag review state per dish, from v_dish_diet_check (migration 513).
 *
 * The view does the work — it walks the BOM, reads each ingredient's confirmation and
 * compares the dish's composition with the one a person last confirmed. This hook only fetches.
 */
export function useDietCheck(): UseDietCheckResult {
  const [checkByDish, setCheckByDish] = useState<Map<string, DishDietCheck>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: viewError } = await supabase
      .from('v_dish_diet_check')
      .select('*')
    if (viewError) {
      setError(viewError.message)
      setIsLoading(false)
      return
    }
    const map = new Map<string, DishDietCheck>()
    for (const raw of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = raw.dish_id as string
      map.set(id, {
        dish_id: id,
        product_code: raw.product_code as string,
        needs_check: !!raw.needs_check,
        reason: raw.reason as DietCheckReason,
        ready: !!raw.ready,
        unconfirmed: Number(raw.unconfirmed ?? 0),
        soft_deleted: Number(raw.soft_deleted ?? 0),
        ingredients: Number(raw.ingredients ?? 0),
        proposed_diets: (raw.proposed_diets as string[] | null) ?? null,
        published_diets: (raw.published_diets as string[] | null) ?? [],
        diet_reviewed_at: (raw.diet_reviewed_at as string | null) ?? null,
        diet_reviewed_by: (raw.diet_reviewed_by as string | null) ?? null,
        // Absent until mig 520 is applied; select('*') keeps the hook working either way.
        blocked_reason: (raw.blocked_reason as string | null) ?? null,
      })
    }
    setCheckByDish(map)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  return { checkByDish, isLoading, error, refetch: fetchRows }
}
