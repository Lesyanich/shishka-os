import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  RECIPE_STEP_SELECT,
  mapRecipeStep,
  type DishRecipeStep,
} from './useDishRecipeSteps'

export interface UseComponentRecipeStepsResult {
  /** Recipe steps grouped by their component nomenclature_id (empty entry omitted). */
  stepsByComponent: Map<string, DishRecipeStep[]>
  isLoading: boolean
  error: string | null
}

/**
 * Batch-fetch recipes_flow steps for a set of component nomenclature ids in ONE
 * round-trip, grouped by parent. Powers the dish-anchored Full Process view and
 * the L1/L2 auto-pull: a dish walks its BOM to its component PFs, then surfaces
 * each PF's make-steps (L1) and service handling (L2 / Assembly) inline.
 *
 * Pass the PF component ids (semi_finished). Raw ids may be passed too — they
 * simply return no rows. The id list is de-duped and order-independent so the
 * fetch key is stable across renders.
 */
export function useComponentRecipeSteps(
  componentIds: string[],
): UseComponentRecipeStepsResult {
  const [stepsByComponent, setStepsByComponent] = useState<
    Map<string, DishRecipeStep[]>
  >(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable key: sorted, de-duped ids. Avoids refetch when the caller passes a
  // new array instance with the same contents.
  const key = useMemo(
    () => Array.from(new Set(componentIds)).sort().join(','),
    [componentIds],
  )

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      setStepsByComponent(new Map())
      setError(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    ;(async () => {
      const { data, error: err } = await supabase
        .from('recipes_flow')
        .select(RECIPE_STEP_SELECT)
        .in('nomenclature_id', ids)
        .order('step_order', { ascending: true })
      if (cancelled) return
      if (err) {
        setError(err.message)
        setStepsByComponent(new Map())
        setIsLoading(false)
        return
      }
      const grouped = new Map<string, DishRecipeStep[]>()
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const parent = row.nomenclature_id as string
        const step = mapRecipeStep(row)
        const bucket = grouped.get(parent)
        if (bucket) bucket.push(step)
        else grouped.set(parent, [step])
      }
      setStepsByComponent(grouped)
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  return { stepsByComponent, isLoading, error }
}
