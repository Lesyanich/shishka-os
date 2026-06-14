import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PrepLabelItem } from '../components/menu/drawer/PrepLabelBlock'

/**
 * Lightweight list of active PF (prep / semi-finished) items for the kitchen
 * label station. Deliberately selects only what the storage label needs — no
 * cost/price columns, so the cook tier never receives financial data.
 */
export function usePrepLabelItems() {
  const [items, setItems] = useState<PrepLabelItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('nomenclature')
      .select('id, name, product_code, card_version')
      .like('product_code', 'PF-%')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        setItems((data ?? []) as PrepLabelItem[])
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
