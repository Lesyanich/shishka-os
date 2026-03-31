import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface RecipeStep {
  id: string
  step_order: number
  operation_name: string
  description: string
  duration_min: number
  equipment_id: string | null
  equipment_name: string | null
  temperature_c: number | null
  internal_temp_c: number | null
  is_passive: boolean
  notes: string | null
}

export interface UseRecipeStepsResult {
  steps: RecipeStep[]
  isLoading: boolean
  error: string | null
  fetchSteps: (nomenclatureId: string) => Promise<RecipeStep[]>
  fetchStepsByCode: (productCode: string) => Promise<RecipeStep[]>
}

export function useRecipeSteps(): UseRecipeStepsResult {
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapRows = (data: Record<string, unknown>[]): RecipeStep[] =>
    data.map((row) => ({
      id: row.id as string,
      step_order: row.step_order as number,
      operation_name: row.operation_name as string,
      description: (row.instruction_text as string) ?? '',
      duration_min: row.duration_min as number,
      equipment_id: row.equipment_id as string | null,
      equipment_name: (row.equipment as { name: string } | null)?.name ?? null,
      temperature_c: row.temperature_c as number | null,
      internal_temp_c: row.internal_temp_c as number | null,
      is_passive: (row.is_passive as boolean) ?? false,
      notes: row.notes as string | null,
    }))

  const SELECT_COLS = 'id, step_order, operation_name, instruction_text, duration_min, equipment_id, equipment(name), temperature_c, internal_temp_c, is_passive, notes'

  /** Fetch recipe steps by nomenclature UUID (preferred) */
  const fetchSteps = useCallback(async (nomenclatureId: string): Promise<RecipeStep[]> => {
    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('recipes_flow')
      .select(SELECT_COLS)
      .eq('nomenclature_id', nomenclatureId)
      .order('step_order', { ascending: true })

    if (fetchError) {
      console.error('[useRecipeSteps] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return []
    }

    const mapped = mapRows((data ?? []) as Record<string, unknown>[])
    setSteps(mapped)
    setIsLoading(false)
    return mapped
  }, [])

  /** Fetch recipe steps by product_code (backward compat) — requires join through nomenclature */
  const fetchStepsByCode = useCallback(async (productCode: string): Promise<RecipeStep[]> => {
    setIsLoading(true)
    setError(null)

    // First resolve product_code → nomenclature_id
    const { data: nom, error: nomError } = await supabase
      .from('nomenclature')
      .select('id')
      .eq('product_code', productCode)
      .single()

    if (nomError || !nom) {
      console.error('[useRecipeSteps] nomenclature lookup error', nomError)
      setError(nomError?.message ?? `Product ${productCode} not found`)
      setIsLoading(false)
      return []
    }

    const { data, error: fetchError } = await supabase
      .from('recipes_flow')
      .select(SELECT_COLS)
      .eq('nomenclature_id', nom.id)
      .order('step_order', { ascending: true })

    if (fetchError) {
      console.error('[useRecipeSteps] fetch error', fetchError)
      setError(fetchError.message)
      setIsLoading(false)
      return []
    }

    const mapped = mapRows((data ?? []) as Record<string, unknown>[])
    setSteps(mapped)
    setIsLoading(false)
    return mapped
  }, [])

  return { steps, isLoading, error, fetchSteps, fetchStepsByCode }
}
