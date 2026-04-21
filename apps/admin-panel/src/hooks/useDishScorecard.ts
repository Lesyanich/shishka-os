import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ScorecardAxes {
  cbs: number
  taste: number
  nutrient: number
  functional: number
  cost: number
}

export interface ScorecardDetails {
  cbs_axes_present: number
  has_foundation: boolean
  has_accent: boolean
  has_finish: boolean
  taste_count: number
  science_count: number
  protein_per_100kcal: number | null
  food_cost_pct: number | null
}

export interface DishScorecard {
  dish_id: string
  dish_name: string
  total: number
  max: number
  axes: ScorecardAxes
  details: ScorecardDetails
}

export interface UseDishScorecardResult {
  scorecard: DishScorecard | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export const SCORECARD_AXIS_LABELS: Record<keyof ScorecardAxes, string> = {
  cbs: 'CBS Coverage',
  taste: 'Taste Breadth',
  nutrient: 'Nutrient Density',
  functional: 'Functional Payload',
  cost: 'Cost Discipline',
}

export function useDishScorecard(dishId: string | null): UseDishScorecardResult {
  const [scorecard, setScorecard] = useState<DishScorecard | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchScorecard = useCallback(async () => {
    if (!dishId) {
      setScorecard(null)
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('fn_dish_scorecard', {
      p_dish_id: dishId,
    })
    if (rpcErr) {
      setError(rpcErr.message)
      setScorecard(null)
    } else if (data && typeof data === 'object' && 'error' in data) {
      setError(String((data as { error: unknown }).error))
      setScorecard(null)
    } else {
      setScorecard(data as DishScorecard)
    }
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchScorecard()
  }, [fetchScorecard])

  return { scorecard, isLoading, error, refetch: fetchScorecard }
}
