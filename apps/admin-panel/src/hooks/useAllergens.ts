import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface UseAllergensResult {
  /** Sorted array of allergen slugs (e.g. ['allergen-dairy', 'allergen-gluten']). */
  allergens: string[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Strips 'allergen-' prefix for display: 'allergen-gluten' → 'Gluten'. */
export function allergenDisplayName(slug: string): string {
  const raw = slug.replace(/^allergen-/, '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function useAllergens(dishId: string | null): UseAllergensResult {
  const [allergens, setAllergens] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!dishId) {
      setAllergens([])
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('fn_dish_allergens', {
      p_dish_id: dishId,
    })
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }
    setAllergens((data as string[] | null) ?? [])
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { allergens, isLoading, error, refetch: fetchData }
}
