import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** A prep (PF) item the kitchen can print a storage label for. */
export interface PrepItem {
  id: string
  name: string
  product_code: string
  base_unit: string | null
}

/**
 * Lightweight list of PF (prep / semi-finished) items for the kitchen label
 * station. Selects only what the storage label needs — no cost/price columns,
 * so the cook tier never receives financial data.
 *
 * NOTE: `nomenclature` has no `is_active` column; PF items are filtered purely
 * by product_code prefix.
 */
export function usePrepLabelItems() {
  const [items, setItems] = useState<PrepItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('nomenclature')
      .select('id, name, product_code, base_unit')
      .like('product_code', 'PF-%')
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        setItems((data ?? []) as PrepItem[])
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
