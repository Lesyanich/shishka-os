import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type BatchStatus = 'sealed' | 'opened' | 'depleted' | 'wasted'

export interface Batch {
  id: string
  nomenclature_id: string
  product_code?: string
  name?: string
  barcode: string
  weight: number
  location_id: string
  location_name?: string
  produced_at: string
  expires_at: string
  opened_at: string | null
  status: BatchStatus
  production_task_id: string | null
}

export interface BatchCreationResult {
  ok: boolean
  task_id?: string
  total_weight?: number
  batch_count?: number
  batches?: { batch_id: string; barcode: string; weight: number }[]
  error?: string
}

export interface UseBatchesResult {
  batches: Batch[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createBatchesFromTask: (
    taskId: string,
    containers: { weight: number }[],
  ) => Promise<BatchCreationResult>
  openBatch: (batchId: string) => Promise<{ ok: boolean; expires_at?: string; error?: string }>
}

export function useBatches(): UseBatchesResult {
  const [batches, setBatches] = useState<Batch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Three queries: inventory_batches + nomenclature + locations, joined in JS
    const [batchResult, nomResult, locResult] = await Promise.all([
      supabase
        .from('inventory_batches')
        .select('id, nomenclature_id, barcode, weight, location_id, produced_at, expires_at, opened_at, status, production_task_id')
        .in('status', ['sealed', 'opened'])
        .order('produced_at', { ascending: false }),
      supabase
        .from('nomenclature')
        .select('id, product_code, name'),
      supabase
        .from('locations')
        .select('id, name'),
    ])

    if (batchResult.error) {
      setError(batchResult.error.message)
      setIsLoading(false)
      return
    }

    const nomMap = new Map(
      (nomResult.data ?? []).map((n) => [n.id, n]),
    )
    const locMap = new Map(
      (locResult.data ?? []).map((l) => [l.id, l]),
    )

    const merged: Batch[] = (batchResult.data ?? []).map((b) => {
      const nom = nomMap.get(b.nomenclature_id)
      const loc = locMap.get(b.location_id)
      return {
        ...b,
        weight: Number(b.weight),
        product_code: nom?.product_code,
        name: nom?.name,
        location_name: loc?.name,
      } as Batch
    })

    setBatches(merged)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchBatches()

    const channel = supabase
      .channel('batches-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches' },
        () => { fetchBatches() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchBatches])

  const createBatchesFromTask = useCallback(
    async (
      taskId: string,
      containers: { weight: number }[],
    ): Promise<BatchCreationResult> => {
      const { data, error: rpcError } = await supabase.rpc(
        'fn_create_batches_from_task',
        {
          p_task_id: taskId,
          p_containers: containers,
        },
      )

      if (rpcError) {
        return { ok: false, error: rpcError.message }
      }

      const result = data as BatchCreationResult
      if (result.ok) {
        await fetchBatches()
      }
      return result
    },
    [fetchBatches],
  )

  const openBatch = useCallback(
    async (batchId: string): Promise<{ ok: boolean; expires_at?: string; error?: string }> => {
      const { data, error: rpcError } = await supabase.rpc(
        'fn_open_batch',
        { p_batch_id: batchId },
      )

      if (rpcError) {
        return { ok: false, error: rpcError.message }
      }

      const result = data as { ok: boolean; expires_at?: string; error?: string }
      if (result.ok) {
        await fetchBatches()
      }
      return result
    },
    [fetchBatches],
  )

  return { batches, isLoading, error, refetch: fetchBatches, createBatchesFromTask, openBatch }
}
