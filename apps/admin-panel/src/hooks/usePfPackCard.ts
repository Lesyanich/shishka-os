import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PfPackCardData {
  nomenclature_id: string
  batch_input_qty: number | null
  batch_input_uom: string | null
  portions_per_batch: number | null
  portion_weight_g: number | null
  vacuum_bag_size: string | null
  fill_weight_per_bag_g: number | null
  portions_per_bag: number | null
  label_template: { fields: string[] } | null
  storage_zone: string | null
  storage_temp_min_c: number | null
  storage_temp_max_c: number | null
  kitchen_photo_url: string | null
}

export interface UsePfPackCardResult {
  card: PfPackCardData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function usePfPackCard(pfId: string | null): UsePfPackCardResult {
  const [card, setCard] = useState<PfPackCardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!pfId) {
      setCard(null)
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('pf_pack_card')
      .select('*')
      .eq('nomenclature_id', pfId)
      .maybeSingle()
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }
    setCard(data as PfPackCardData | null)
    setIsLoading(false)
  }, [pfId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { card, isLoading, error, refetch: fetchData }
}
