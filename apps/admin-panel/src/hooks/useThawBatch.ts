import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Result of fn_thaw_batch (mig 350/350a): a Freezer→Fridge move that re-clocks
 * the batch's use-by to LEAST(frozen expiry, now + thawed_shelf_life) and logs
 * the transfer. Returns the payload so the UI can show the new use-by date and
 * prompt a re-label (the physical pack must match the system clock). */
export interface ThawResult {
  ok: boolean
  batch_id?: string
  barcode?: string
  batch_code?: string
  name?: string
  weight?: number
  base_unit?: string
  new_expires_at?: string
  thawed_days?: number
  error?: string
}

/** Thaw one frozen batch by its barcode (Freezer → Fridge).
 * `byStaffId` = the acting staff's UUID (fn_thaw_batch.p_by is uuid, mig 350a). */
export function useThawBatch(byStaffId?: string | null) {
  const [isThawing, setIsThawing] = useState(false)
  const [lastThaw, setLastThaw] = useState<ThawResult | null>(null)

  const thawBatch = useCallback(
    async (barcode: string): Promise<ThawResult> => {
      setIsThawing(true)
      setLastThaw(null)
      const { data, error: rpcErr } = await supabase.rpc('fn_thaw_batch', {
        p_barcode: barcode,
        p_by: byStaffId || null,
      })
      const result: ThawResult = rpcErr
        ? { ok: false, error: rpcErr.message }
        : (data as ThawResult)
      setLastThaw(result)
      setIsThawing(false)
      return result
    },
    [byStaffId],
  )

  return { thawBatch, isThawing, lastThaw }
}
