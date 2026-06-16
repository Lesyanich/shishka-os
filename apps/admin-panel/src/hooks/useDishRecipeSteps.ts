import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishRecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  instruction_text: string | null
  temperature_c: number | null
  internal_temp_c: number | null
  equipment_name: string | null
  equipment_category: string | null
  is_passive: boolean
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
  location_id: string | null
  location_name: string | null
}

export interface UseDishRecipeStepsResult {
  steps: DishRecipeStep[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Auto-fetching hook for recipe steps including HACCP CCP fields.
 * Used by the DishDrawer L1CookTab. For imperative fetch, use useRecipeSteps. */
export function useDishRecipeSteps(
  nomenclatureId: string | null,
): UseDishRecipeStepsResult {
  const [steps, setSteps] = useState<DishRecipeStep[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!nomenclatureId) {
      setSteps([])
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('recipes_flow')
      .select(
        'id, step_order, operation_name, duration_min, instruction_text, temperature_c, internal_temp_c, equipment(name, category), notes, is_ccp, ccp_check_text, is_passive, location_id, location:locations(name)',
      )
      .eq('nomenclature_id', nomenclatureId)
      .order('step_order', { ascending: true })
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }
    const mapped: DishRecipeStep[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      step_number: r.step_order as number,
      operation_name: r.operation_name as string,
      duration_min: r.duration_min as number | null,
      instruction_text: r.instruction_text as string | null,
      temperature_c: r.temperature_c as number | null,
      internal_temp_c: r.internal_temp_c as number | null,
      equipment_name: (r.equipment as { name: string; category: string } | null)?.name ?? null,
      equipment_category: (r.equipment as { name: string; category: string } | null)?.category ?? null,
      is_passive: (r.is_passive as boolean) ?? false,
      notes: r.notes as string | null,
      is_ccp: (r.is_ccp as boolean) ?? false,
      ccp_check_text: r.ccp_check_text as string | null,
      location_id: (r.location_id as string | null) ?? null,
      location_name: (r.location as { name: string } | null)?.name ?? null,
    }))
    setSteps(mapped)
    setIsLoading(false)
  }, [nomenclatureId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { steps, isLoading, error, refetch: fetchData }
}
