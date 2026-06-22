import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Whether a label item is a semi-finished prep (PF-) or a finished dish (SALE-). */
export type PrepItemKind = 'PF' | 'SALE'

/** A prep (PF) or finished dish (SALE) item the kitchen can print a storage label for. */
export interface PrepItem {
  id: string
  name: string
  product_code: string
  base_unit: string | null
  /** Derived from the product_code prefix — used for the PF / Sale filter. */
  kind: PrepItemKind
}

/**
 * Lightweight list of items the kitchen label station can print for: PF
 * (prep / semi-finished) and SALE (finished dishes). A dish made and stored
 * ready-to-serve in the kitchen (e.g. hummus portioned for display) is a SALE
 * item, not a PF — so both are offered and filterable on the page.
 *
 * Selects only what the storage label needs — no cost/price columns, so the
 * cook tier never receives financial data.
 *
 * NOTE: `nomenclature` has no `is_active` column; items are filtered purely by
 * product_code prefix, excluding soft-deleted rows.
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
      .or('product_code.like.PF-%,product_code.like.SALE-%')
      .not('is_deleted', 'is', true)
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        const mapped: PrepItem[] = (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          product_code: row.product_code,
          base_unit: row.base_unit,
          kind: row.product_code.startsWith('SALE-') ? 'SALE' : 'PF',
        }))
        setItems(mapped)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
