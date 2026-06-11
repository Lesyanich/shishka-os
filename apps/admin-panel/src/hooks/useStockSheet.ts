import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  StockSheetItem,
  StockSheetLineInput,
  SubmitStockSheetResult,
} from '../types/stockSheet'

export interface UseStockSheetResult {
  items: StockSheetItem[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  submit: (
    passcode: string,
    note: string | null,
    lines: StockSheetLineInput[],
  ) => Promise<SubmitStockSheetResult>
  isSubmitting: boolean
}

/**
 * Public staff stock-order sheet. Reads the cost-free v_stock_sheet_items view
 * (anon-readable) and submits via fn_submit_stock_sheet (passcode-gated, anon).
 * No auth session required — runs on the anon Supabase key.
 */
export function useStockSheet(): UseStockSheetResult {
  const [items, setItems] = useState<StockSheetItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('v_stock_sheet_items')
      .select(
        'id, name, emoji, base_unit, storage_location, category_id, category_code, category_name, category_name_th, category_sort, in_active_menu',
      )
      .order('category_sort', { ascending: true })
      .order('name', { ascending: true })

    if (qErr) {
      setError(qErr.message)
      setItems([])
    } else {
      setItems((data ?? []) as StockSheetItem[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const submit = useCallback(
    async (
      passcode: string,
      note: string | null,
      lines: StockSheetLineInput[],
    ): Promise<SubmitStockSheetResult> => {
      setIsSubmitting(true)
      const { data, error: rpcErr } = await supabase.rpc('fn_submit_stock_sheet', {
        p_passcode: passcode,
        p_note: note,
        p_lines: lines,
      })
      setIsSubmitting(false)

      if (rpcErr) return { ok: false, error: rpcErr.message }
      return data as SubmitStockSheetResult
    },
    [],
  )

  return { items, isLoading, error, refetch: fetchItems, submit, isSubmitting }
}
