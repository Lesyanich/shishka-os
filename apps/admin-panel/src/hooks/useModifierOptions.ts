import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ModifierOption {
  id: string
  dish_id: string
  modifier_id: string
  modifier_name: string
  modifier_code: string
  price_delta: number
  is_default: boolean
  sort_order: number
}

export interface UseModifierOptionsResult {
  modifiers: ModifierOption[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useModifierOptions(dishId: string | null): UseModifierOptionsResult {
  const [modifiers, setModifiers] = useState<ModifierOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!dishId) {
      setModifiers([])
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('nomenclature_modifier_options')
      .select(`
        id, dish_id, modifier_id, price_delta, is_default, sort_order,
        nomenclature!modifier_id(name, product_code)
      `)
      .eq('dish_id', dishId)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }

    const rows: ModifierOption[] = ((data ?? []) as unknown as Array<{
      id: string
      dish_id: string
      modifier_id: string
      price_delta: number | string
      is_default: boolean
      sort_order: number
      nomenclature: { name: string; product_code: string } | null
    }>).map((r) => ({
      id: r.id,
      dish_id: r.dish_id,
      modifier_id: r.modifier_id,
      modifier_name: r.nomenclature?.name ?? 'Unknown',
      modifier_code: r.nomenclature?.product_code ?? '',
      price_delta: Number(r.price_delta),
      is_default: r.is_default,
      sort_order: r.sort_order,
    }))
    setModifiers(rows)
    setIsLoading(false)
  }, [dishId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { modifiers, isLoading, error, refetch: fetchData }
}
