import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DishCostTrust, DishTrustClass } from '../components/menu/shared/costTrust'

export interface UseCostTrustResult {
  /** v_dish_cost_trust row keyed by dish_id (SALE / PF / MOD). */
  trustByDish: Map<string, DishCostTrust>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Numeric columns can arrive as strings from PostgREST. */
function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Cost provenance per sellable item, from v_dish_cost_trust (migration 480).
 *
 * The view does the classifying — it walks the BOM tree, compares every
 * ingredient's stored cost against its own purchase history and reports the
 * worst class found plus the ingredient that caused it. This hook only fetches.
 */
export function useCostTrust(): UseCostTrustResult {
  const [trustByDish, setTrustByDish] = useState<Map<string, DishCostTrust>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrust = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: viewError } = await supabase
      .from('v_dish_cost_trust')
      .select(
        'dish_id, product_code, trust_class, trust_rank, ingredient_count, ' +
          'zero_cost_count, deleted_count, unverified_count, estimated_count, ' +
          'manual_count, verified_count, has_deleted_ingredient, ' +
          'worst_ingredient_name, worst_ingredient_code, worst_ingredient_reason, ' +
          'worst_ingredient_cost, worst_ingredient_history_cost, worst_ingredient_divergence',
      )

    if (viewError) {
      setError(viewError.message)
      setIsLoading(false)
      return
    }

    const map = new Map<string, DishCostTrust>()
    for (const raw of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = raw.dish_id as string
      map.set(id, {
        dish_id: id,
        product_code: raw.product_code as string,
        trust_class: raw.trust_class as DishTrustClass,
        trust_rank: Number(raw.trust_rank ?? 0),
        ingredient_count: Number(raw.ingredient_count ?? 0),
        zero_cost_count: Number(raw.zero_cost_count ?? 0),
        deleted_count: Number(raw.deleted_count ?? 0),
        unverified_count: Number(raw.unverified_count ?? 0),
        estimated_count: Number(raw.estimated_count ?? 0),
        manual_count: Number(raw.manual_count ?? 0),
        verified_count: Number(raw.verified_count ?? 0),
        has_deleted_ingredient: !!raw.has_deleted_ingredient,
        worst_ingredient_name: (raw.worst_ingredient_name as string | null) ?? null,
        worst_ingredient_code: (raw.worst_ingredient_code as string | null) ?? null,
        worst_ingredient_reason: (raw.worst_ingredient_reason as string | null) ?? null,
        worst_ingredient_cost: num(raw.worst_ingredient_cost as number | string | null),
        worst_ingredient_history_cost: num(
          raw.worst_ingredient_history_cost as number | string | null,
        ),
        worst_ingredient_divergence: num(
          raw.worst_ingredient_divergence as number | string | null,
        ),
      })
    }
    setTrustByDish(map)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchTrust()
  }, [fetchTrust])

  return { trustByDish, isLoading, error, refetch: fetchTrust }
}
