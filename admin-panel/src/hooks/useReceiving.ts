import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  PendingDelivery,
  ReceiveGoodsPayload,
  ReceiveGoodsResult,
} from '../types/procurement'

export interface UseReceivingResult {
  deliveries: PendingDelivery[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  receiveGoods: (payload: ReceiveGoodsPayload) => Promise<ReceiveGoodsResult>
  isSubmitting: boolean
}

export function useReceiving(): UseReceivingResult {
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchDeliveries = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('fn_pending_deliveries')

    if (rpcError) {
      setError(rpcError.message)
      setIsLoading(false)
      return
    }

    const result = data as { ok: boolean; deliveries?: PendingDelivery[]; error?: string }

    if (!result.ok) {
      setError(result.error ?? 'Unknown error')
      setIsLoading(false)
      return
    }

    setDeliveries(result.deliveries ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchDeliveries()

    const channel = supabase
      .channel('receiving-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => { fetchDeliveries() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchDeliveries])

  const receiveGoods = useCallback(
    async (payload: ReceiveGoodsPayload): Promise<ReceiveGoodsResult> => {
      setIsSubmitting(true)

      const { data, error: rpcError } = await supabase.rpc('fn_receive_goods', {
        p_payload: payload,
      })

      setIsSubmitting(false)

      if (rpcError) {
        return { ok: false, error: rpcError.message }
      }

      return data as ReceiveGoodsResult
    },
    [],
  )

  return { deliveries, isLoading, error, refetch: fetchDeliveries, receiveGoods, isSubmitting }
}
