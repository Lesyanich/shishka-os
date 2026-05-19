import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ChannelMargin {
  nomenclature_id: string
  product_code: string
  name: string
  walk_in_price: number | null
  channel_price: number | null
  commission_pct: number | null
  cost_per_unit: number | null
  walk_in_food_cost_pct: number | null
  channel_food_cost_pct: number | null
  walk_in_margin: number | null
  channel_net_revenue: number | null
  channel_margin: number | null
}

export interface UseChannelMarginsResult {
  margins: Map<string, ChannelMargin>
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useChannelMargins(channel = 'grab'): UseChannelMarginsResult {
  const [margins, setMargins] = useState<Map<string, ChannelMargin>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMargins = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('get_channel_margins', {
      p_channel: channel,
    })

    if (rpcError) {
      setError(rpcError.message)
      setIsLoading(false)
      return
    }

    const map = new Map<string, ChannelMargin>()
    for (const row of (data ?? []) as ChannelMargin[]) {
      map.set(row.nomenclature_id, row)
    }
    setMargins(map)
    setIsLoading(false)
  }, [channel])

  useEffect(() => {
    fetchMargins()
  }, [fetchMargins])

  return { margins, isLoading, error, refetch: fetchMargins }
}
