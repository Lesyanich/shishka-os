import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishCardData {
  nomenclature_id: string
  container_l2: string | null
  assembly_order: { step: number; text: string }[] | null
  pre_merrychef_prep: string | null
  post_merrychef_check: string | null
  cold_addons_after_reheat: string | null
  has_cutlery: boolean
  has_lid_sticker: boolean
  assembler_photo_url: string | null
  customer_eta_min: number | null
  composition_override: string | null
}

export interface AssemblyComponent {
  dish_id: string
  component_id: string
  component_code: string
  component_name: string
  component_type: string
  qty_per_portion: number
  base_unit: string | null
  slot: string | null
  notes: string | null
}

export interface UseDishCardResult {
  card: DishCardData | null
  components: AssemblyComponent[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useDishCard(dishId: string | null): UseDishCardResult {
  const [card, setCard] = useState<DishCardData | null>(null)
  const [components, setComponents] = useState<AssemblyComponent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!dishId) {
      setCard(null)
      setComponents([])
      return
    }
    setIsLoading(true)
    setError(null)

    const [cardRes, compRes] = await Promise.all([
      supabase
        .from('dish_card')
        .select('*')
        .eq('nomenclature_id', dishId)
        .maybeSingle(),
      supabase
        .from('v_dish_assembly_components')
        .select('*')
        .eq('dish_id', dishId),
    ])

    if (cardRes.error) {
      setError(cardRes.error.message)
      setIsLoading(false)
      return
    }
    if (compRes.error) {
      setError(compRes.error.message)
      setIsLoading(false)
      return
    }

    setCard(cardRes.data as DishCardData | null)
    setComponents((compRes.data ?? []) as AssemblyComponent[])
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { card, components, isLoading, error, refetch: fetchData }
}
