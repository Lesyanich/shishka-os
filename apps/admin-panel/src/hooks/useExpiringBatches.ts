// ═══════════════════════════════════════════════════════════
// Hook: useExpiringBatches
// Surfaces produced batches (inventory_batches) by expiry so the kitchen
// can use-or-toss before they go off. One-tap write-off flips the batch to
// 'wasted' and records a waste_log (reason=expiration) via the shared
// recordWaste() helper.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { recordWaste, type WasteReason } from '../lib/waste'

export interface ExpiringBatch {
  id: string
  nomenclature_id: string
  product_code?: string
  name?: string
  base_unit: string | null
  cost_per_unit: number | null
  barcode: string
  weight: number
  location_name?: string
  produced_at: string
  expires_at: string | null
  status: 'sealed' | 'opened'
  /** Whole days until expiry (negative = already expired). null if no expiry set. */
  daysToExpiry: number | null
}

export interface UseExpiringBatchesResult {
  batches: ExpiringBatch[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  /** Write off a single batch: status → 'wasted' + waste_log + FIFO decrement. */
  wasteBatch: (
    batch: ExpiringBatch,
    reason?: WasteReason,
    loggedBy?: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
}

function wholeDaysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.floor(ms / 86_400_000)
}

export function useExpiringBatches(): UseExpiringBatchesResult {
  const [batches, setBatches] = useState<ExpiringBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBatches = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [batchResult, nomResult, locResult] = await Promise.all([
      supabase
        .from('inventory_batches')
        .select('id, nomenclature_id, barcode, weight, location_id, produced_at, expires_at, status')
        .in('status', ['sealed', 'opened'])
        .order('expires_at', { ascending: true, nullsFirst: false }),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit, cost_per_unit'),
      supabase
        .from('locations')
        .select('id, name'),
    ])

    if (batchResult.error) {
      setError(batchResult.error.message)
      setIsLoading(false)
      return
    }

    const nomMap = new Map((nomResult.data ?? []).map((n) => [n.id, n]))
    const locMap = new Map((locResult.data ?? []).map((l) => [l.id, l]))

    const merged: ExpiringBatch[] = (batchResult.data ?? []).map((b) => {
      const nom = nomMap.get(b.nomenclature_id)
      const loc = locMap.get(b.location_id)
      return {
        id: b.id,
        nomenclature_id: b.nomenclature_id,
        product_code: nom?.product_code,
        name: nom?.name,
        base_unit: nom?.base_unit ?? null,
        cost_per_unit: nom?.cost_per_unit != null ? Number(nom.cost_per_unit) : null,
        barcode: b.barcode,
        weight: Number(b.weight),
        location_name: loc?.name,
        produced_at: b.produced_at,
        expires_at: b.expires_at,
        status: b.status as 'sealed' | 'opened',
        daysToExpiry: wholeDaysUntil(b.expires_at),
      }
    })

    setBatches(merged)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchBatches()

    const channel = supabase
      .channel('expiring-batches-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches' },
        () => { fetchBatches() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchBatches])

  const wasteBatch = useCallback(
    async (
      batch: ExpiringBatch,
      reason: WasteReason = 'expiration',
      loggedBy: string | null = null,
    ): Promise<{ ok: boolean; error?: string }> => {
      // 1. Flip the batch out of stock.
      const { error: statusError } = await supabase
        .from('inventory_batches')
        .update({ status: 'wasted' })
        .eq('id', batch.id)

      if (statusError) {
        return { ok: false, error: statusError.message }
      }

      // 2. Record the waste (audit + financial liability + FIFO decrement).
      const result = await recordWaste({
        nomenclature_id: batch.nomenclature_id,
        quantity: batch.weight,
        reason,
        financial_liability: 'cafe',
        comment: `Batch ${batch.barcode} (${batch.name ?? batch.product_code ?? ''}) — ${reason}`,
        logged_by: loggedBy,
      })

      if (!result.ok) {
        // Best-effort rollback of the status flip so the batch isn't lost silently.
        await supabase
          .from('inventory_batches')
          .update({ status: batch.status })
          .eq('id', batch.id)
        return result
      }

      await fetchBatches()
      return { ok: true }
    },
    [fetchBatches],
  )

  return { batches, isLoading, error, refetch: fetchBatches, wasteBatch }
}

/** Convenience: split batches into urgency buckets for display. */
export function useExpiryBuckets(batches: ExpiringBatch[]) {
  return useMemo(() => {
    const expired: ExpiringBatch[] = []
    const today: ExpiringBatch[] = []
    const soon: ExpiringBatch[] = []
    const later: ExpiringBatch[] = []
    for (const b of batches) {
      if (b.daysToExpiry == null) { later.push(b); continue }
      if (b.daysToExpiry < 0) expired.push(b)
      else if (b.daysToExpiry === 0) today.push(b)
      else if (b.daysToExpiry <= 2) soon.push(b)
      else later.push(b)
    }
    return { expired, today, soon, later }
  }, [batches])
}
