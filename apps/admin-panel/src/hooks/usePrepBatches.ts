import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays } from '../lib/labelPrinting'

/** A recorded prep batch (one printed label = one row in inventory_batches). */
export interface PrepBatch {
  id: string
  nomenclature_id: string
  barcode: string
  batch_code: string | null
  weight: number
  location_id: string
  produced_at: string
  expires_at: string
  status: string
}

export interface CreatePrepBatchInput {
  nomenclatureId: string
  productCode: string
  weight: number
  shelfLifeDays: number
  locationId: string
  producedBy: string | null
  /** Sequence suffix for multi-label runs, so each bag gets a unique code/QR. */
  seq?: number
}

const SELECT =
  'id, nomenclature_id, barcode, batch_code, weight, location_id, produced_at, expires_at, status'

/** Human + scannable batch code, e.g. "HUMMUS-260614-143022" (+"-2" for run #2). */
function genBatchCode(productCode: string, seq?: number): string {
  const prefix =
    productCode.replace(/^(PF|SALE|MOD|RAW)-/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() ||
    'BATCH'
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${String(d.getFullYear()).slice(-2)}${p(d.getMonth() + 1)}${p(d.getDate())}`
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const suffix = seq != null ? `-${seq}` : ''
  return `${prefix}-${date}-${time}${suffix}`
}

/**
 * Recorded prep batches for one PF item. Every printed label creates a row, so
 * batch counts come from data — not from counting paper. Cooks can delete a
 * mistaken row and reprint.
 */
export function usePrepBatches(nomenclatureId: string | null) {
  const [batches, setBatches] = useState<PrepBatch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!nomenclatureId) {
      setBatches([])
      return
    }
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('inventory_batches')
      .select(SELECT)
      .eq('nomenclature_id', nomenclatureId)
      .order('produced_at', { ascending: false })
      .limit(50)
    if (err) setError(err.message)
    else setBatches((data ?? []) as PrepBatch[])
    setIsLoading(false)
  }, [nomenclatureId])

  useEffect(() => {
    refetch()
  }, [refetch])

  const create = useCallback(
    async (input: CreatePrepBatchInput): Promise<{ ok: boolean; batch?: PrepBatch; error?: string }> => {
      const code = genBatchCode(input.productCode, input.seq)
      const { data, error: err } = await supabase
        .from('inventory_batches')
        .insert({
          nomenclature_id: input.nomenclatureId,
          barcode: code,
          batch_code: code,
          weight: input.weight,
          location_id: input.locationId,
          expires_at: addDays(new Date(), input.shelfLifeDays).toISOString(),
          produced_by: input.producedBy,
          status: 'sealed',
        })
        .select(SELECT)
        .single()
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true, batch: data as PrepBatch }
    },
    [refetch],
  )

  const remove = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { error: err } = await supabase.from('inventory_batches').delete().eq('id', id)
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  return { batches, isLoading, error, create, remove, refetch }
}
