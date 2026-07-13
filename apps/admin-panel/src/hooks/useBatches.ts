import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'

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

  const fetchBatches = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
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
  }, [fetchBatches])

  useCoalescedRealtimeRefetch('batches-live', [{ table: 'inventory_batches' }],
    () => { fetchBatches({ silent: true }) })

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
      // New batches arrive via the realtime subscription (silent, coalesced) —
      // no explicit refetch needed.
      return result
    },
    [],
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
        // Optimistic: mark the batch opened in place (still within the
        // sealed/opened filter); realtime reconciles the rest.
        setBatches((prev) =>
          prev.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  status: 'opened' as const,
                  opened_at: new Date().toISOString(),
                  expires_at: result.expires_at ?? b.expires_at,
                }
              : b,
          ),
        )
      }
      return result
    },
    [],
  )

  return { batches, isLoading, error, refetch: fetchBatches, createBatchesFromTask, openBatch }
}
