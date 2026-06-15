import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Short station label cooks use: L1 = Kitchen prep, L2 = Assembly / bar. */
export type StationLabel = 'L1' | 'L2'

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
  /** Station this step runs at. null = not yet assigned. */
  location_id: string | null
  station: StationLabel | null
}

export interface UseRecipeStepsResult {
  steps: RecipeStep[]
  isLoading: boolean
  error: string | null
  fetchSteps: (nomenclatureId: string) => Promise<RecipeStep[]>
  fetchStepsByCode: (productCode: string) => Promise<RecipeStep[]>
  /** Map of station label → locations.id (loaded once). */
  stationIds: Record<StationLabel, string | null>
  /** Persist a step's station. Pass null to clear. Optimistic. */
  setStepStation: (stepId: string, station: StationLabel | null) => Promise<{ ok: boolean; error?: string }>
}

function stationFromName(name: string | null | undefined): StationLabel | null {
  if (name === 'Kitchen') return 'L1'
  if (name === 'Assembly') return 'L2'
  return null
}

export function useRecipeSteps(): UseRecipeStepsResult {
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stationIds, setStationIds] = useState<Record<StationLabel, string | null>>({
    L1: null,
    L2: null,
  })

  // Resolve the Kitchen / Assembly location ids once so the station selector can
  // write location_id without hardcoding UUIDs.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: locError } = await supabase
        .from('locations')
        .select('id, type')
        .in('type', ['kitchen', 'assembly'])
      if (locError || cancelled) return
      const next: Record<StationLabel, string | null> = { L1: null, L2: null }
      for (const row of data ?? []) {
        if (row.type === 'kitchen') next.L1 = row.id as string
        if (row.type === 'assembly') next.L2 = row.id as string
      }
      setStationIds(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      location_id: (row.location_id as string | null) ?? null,
      station: stationFromName((row.location as { name: string } | null)?.name),
    }))

  const SELECT_COLS = 'id, step_order, operation_name, instruction_text, duration_min, equipment_id, equipment(name), temperature_c, internal_temp_c, is_passive, notes, location_id, location:locations(name)'

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

  const setStepStation = useCallback(
    async (stepId: string, station: StationLabel | null): Promise<{ ok: boolean; error?: string }> => {
      const locationId = station ? stationIds[station] : null
      if (station && !locationId) {
        return { ok: false, error: 'Station location not loaded yet' }
      }

      // Optimistic update.
      const prev = steps
      setSteps((cur) =>
        cur.map((s) => (s.id === stepId ? { ...s, location_id: locationId, station } : s)),
      )

      const { error: updateError } = await supabase
        .from('recipes_flow')
        .update({ location_id: locationId })
        .eq('id', stepId)

      if (updateError) {
        console.error('[useRecipeSteps] station update error', updateError)
        setSteps(prev) // revert
        return { ok: false, error: updateError.message }
      }
      return { ok: true }
    },
    [steps, stationIds],
  )

  return { steps, isLoading, error, fetchSteps, fetchStepsByCode, stationIds, setStepStation }
}
