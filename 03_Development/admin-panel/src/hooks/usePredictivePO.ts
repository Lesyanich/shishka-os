import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface POItem {
  nomenclature_id: string
  product_code: string
  name: string
  unit: string
  needed: number
  on_hand: number
  shortage: number
}

export interface PredictivePOResult {
  ok: boolean
  plan_id?: string
  product_code?: string
  target_quantity?: number
  items: POItem[]
  error?: string
}

export interface UsePredictivePOResult {
  result: PredictivePOResult | null
  isLoading: boolean
  error: string | null
  fetchPO: (planId: string) => Promise<void>
}

export function usePredictivePO(): UsePredictivePOResult {
  const [result, setResult] = useState<PredictivePOResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPO = useCallback(async (planId: string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)

    const { data, error: rpcError } = await supabase.rpc(
      'fn_predictive_procurement',
      { p_plan_id: planId },
    )

    if (rpcError) {
      setError(rpcError.message)
      setIsLoading(false)
      return
    }

    const parsed = data as {
      ok: boolean
      error?: string
      plan_id?: string
      product_code?: string
      target_quantity?: number
      items?: POItem[]
    }

    if (!parsed.ok) {
      setError(parsed.error ?? 'RPC returned error')
      setIsLoading(false)
      return
    }

    setResult({
      ok: true,
      plan_id: parsed.plan_id,
      product_code: parsed.product_code,
      target_quantity: parsed.target_quantity,
      items: parsed.items ?? [],
    })
    setIsLoading(false)
  }, [])

  return { result, isLoading, error, fetchPO }
}
