import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { HACCPCheckpointType } from '../types/haccp'

export interface RecipeStep {
  id: string
  step_order: number
  operation_name: string
  description: string | null
  duration_min: number
  equipment_id: string | null
  equipment_name: string | null
  temperature_c: number | null
  internal_temp_c: number | null
  is_passive: boolean
  notes: string | null
  // HACCP fields
  haccp_checkpoint: boolean
  haccp_type: HACCPCheckpointType | null
  haccp_target_value: number | null
  haccp_tolerance: number | null
  // Media
  media_url: string | null
  scaling_rule: string | null
}

export function useRecipeSteps() {
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchSteps = useCallback(async (nomenclatureId: string): Promise<RecipeStep[]> => {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('recipes_flow')
      .select(`
        id, step_order, operation_name, instruction_text, duration_min,
        equipment_id, temperature_c, internal_temp_c, is_passive, notes,
        haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance,
        media_url, scaling_rule,
        equipment:equipment!recipes_flow_equipment_id_fkey(name)
      `)
      .eq('nomenclature_id', nomenclatureId)
      .order('step_order', { ascending: true })

    setIsLoading(false)

    if (error || !data) {
      setSteps([])
      return []
    }

    const mapped: RecipeStep[] = data.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      step_order: row.step_order as number,
      operation_name: row.operation_name as string,
      description: row.instruction_text as string | null,
      duration_min: (row.duration_min as number) ?? 0,
      equipment_id: row.equipment_id as string | null,
      equipment_name: (row.equipment as { name: string } | null)?.name ?? null,
      temperature_c: row.temperature_c as number | null,
      internal_temp_c: row.internal_temp_c as number | null,
      is_passive: (row.is_passive as boolean) ?? false,
      notes: row.notes as string | null,
      haccp_checkpoint: (row.haccp_checkpoint as boolean) ?? false,
      haccp_type: row.haccp_type as HACCPCheckpointType | null,
      haccp_target_value: row.haccp_target_value as number | null,
      haccp_tolerance: row.haccp_tolerance as number | null,
      media_url: row.media_url as string | null,
      scaling_rule: row.scaling_rule as string | null,
    }))

    setSteps(mapped)
    return mapped
  }, [])

  return { steps, isLoading, fetchSteps }
}
