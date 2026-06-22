import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PrepItemKind } from './usePrepLabelItems'

/**
 * A recorded batch across ALL items, with its item name resolved. Powers the
 * global "All batches" production log on the label station — what was made,
 * when it was made, and when its sticker was printed.
 */
export interface AllPrepBatch {
  id: string
  batch_code: string | null
  barcode: string
  weight: number
  /** When the batch was prepared. */
  produced_at: string
  /** When the row was recorded — i.e. when the label was printed. */
  created_at: string
  expires_at: string
  status: string
  nomenclature_id: string
  name: string
  product_code: string
  base_unit: string | null
  kind: PrepItemKind
}

/** Shape of the embedded nomenclature join (untyped supabase client). */
interface RawBatchRow {
  id: string
  batch_code: string | null
  barcode: string
  weight: number
  produced_at: string
  created_at: string
  expires_at: string
  status: string
  nomenclature_id: string
  nomenclature: {
    name: string | null
    product_code: string | null
    base_unit: string | null
  } | null
}

const SELECT =
  'id, batch_code, barcode, weight, produced_at, created_at, expires_at, status, nomenclature_id, nomenclature:nomenclature_id(name, product_code, base_unit)'

/**
 * Recent prep batches across every item (PF + SALE), newest first, with the
 * item name joined in. Read-only log; delete is supported so a cook can drop a
 * mistaken record. No cost/price columns — safe for the cook tier.
 */
export function useAllPrepBatches() {
  const [batches, setBatches] = useState<AllPrepBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('inventory_batches')
      .select(SELECT)
      .order('produced_at', { ascending: false })
      .limit(200)
    if (err) {
      setError(err.message)
      setBatches([])
      setIsLoading(false)
      return
    }
    const rows = (data ?? []) as unknown as RawBatchRow[]
    const mapped: AllPrepBatch[] = rows.map((row) => {
      const code = row.nomenclature?.product_code ?? ''
      return {
        id: row.id,
        batch_code: row.batch_code,
        barcode: row.barcode,
        weight: row.weight,
        produced_at: row.produced_at,
        created_at: row.created_at,
        expires_at: row.expires_at,
        status: row.status,
        nomenclature_id: row.nomenclature_id,
        name: row.nomenclature?.name ?? '—',
        product_code: code,
        base_unit: row.nomenclature?.base_unit ?? null,
        kind: code.startsWith('SALE-') ? 'SALE' : 'PF',
      }
    })
    setBatches(mapped)
    setError(null)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const remove = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const { error: err } = await supabase.from('inventory_batches').delete().eq('id', id)
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true }
    },
    [refetch],
  )

  return { batches, isLoading, error, refetch, remove }
}
