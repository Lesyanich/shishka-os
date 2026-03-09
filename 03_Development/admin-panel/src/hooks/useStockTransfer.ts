import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface TransferResult {
  ok: boolean
  batch_id?: string
  barcode?: string
  from?: string
  to?: string
  weight?: number
  error?: string
}

export interface UseStockTransferResult {
  transferBatch: (barcode: string, toLocation: string) => Promise<TransferResult>
  isTransferring: boolean
  lastTransfer: TransferResult | null
}

export function useStockTransfer(): UseStockTransferResult {
  const [isTransferring, setIsTransferring] = useState(false)
  const [lastTransfer, setLastTransfer] = useState<TransferResult | null>(null)

  const transferBatch = useCallback(
    async (barcode: string, toLocation: string): Promise<TransferResult> => {
      setIsTransferring(true)
      setLastTransfer(null)

      const { data, error: rpcError } = await supabase.rpc(
        'fn_transfer_batch',
        {
          p_barcode: barcode,
          p_to_location: toLocation,
        },
      )

      if (rpcError) {
        const result: TransferResult = { ok: false, error: rpcError.message }
        setLastTransfer(result)
        setIsTransferring(false)
        return result
      }

      const result = data as TransferResult
      setLastTransfer(result)
      setIsTransferring(false)
      return result
    },
    [],
  )

  return { transferBatch, isTransferring, lastTransfer }
}
