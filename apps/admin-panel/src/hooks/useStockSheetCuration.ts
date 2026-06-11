import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CurationItem {
  id: string
  product_code: string
  name: string
  type: string
  category_name: string | null
  in_stock_sheet: boolean
  storage_location: string | null
}

export interface UseStockSheetCurationResult {
  items: CurationItem[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  setInclude: (id: string, value: boolean) => Promise<void>
  setStorage: (id: string, value: string | null) => Promise<void>
}

const CANDIDATE_TYPES = ['raw_ingredient', 'good', 'semi_finished']

/**
 * Owner curation of which catalog items appear on the staff stock sheet, and
 * their storage zone. The full catalog is large, so the owner picks a subset.
 */
export function useStockSheetCuration(): UseStockSheetCurationResult {
  const [items, setItems] = useState<CurationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [nomRes, catRes] = await Promise.all([
      supabase
        .from('nomenclature')
        .select('id, product_code, name, type, category_id, in_stock_sheet, storage_location')
        .in('type', CANDIDATE_TYPES)
        .eq('is_deleted', false)
        .not('name', 'ilike', '[MERGED%')
        .not('name', 'ilike', '#%')
        .order('name'),
      supabase.from('product_categories').select('id, name'),
    ])

    if (nomRes.error) {
      setError(nomRes.error.message)
      setItems([])
      setIsLoading(false)
      return
    }

    const catMap = new Map(
      (catRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
    )

    setItems(
      (nomRes.data ?? []).map((n) => ({
        id: n.id,
        product_code: n.product_code,
        name: n.name,
        type: n.type,
        category_name: n.category_id ? catMap.get(n.category_id) ?? null : null,
        in_stock_sheet: n.in_stock_sheet ?? false,
        storage_location: n.storage_location,
      })),
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const setInclude = useCallback(async (id: string, value: boolean) => {
    // Optimistic.
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, in_stock_sheet: value } : it)))
    const { error: upErr } = await supabase
      .from('nomenclature')
      .update({ in_stock_sheet: value })
      .eq('id', id)
    if (upErr) {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, in_stock_sheet: !value } : it)))
    }
  }, [])

  const setStorage = useCallback(async (id: string, value: string | null) => {
    const prevValue = items.find((it) => it.id === id)?.storage_location ?? null
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, storage_location: value } : it)))
    const { error: upErr } = await supabase
      .from('nomenclature')
      .update({ storage_location: value })
      .eq('id', id)
    if (upErr) {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, storage_location: prevValue } : it)))
    }
  }, [items])

  return { items, isLoading, error, refetch: fetchItems, setInclude, setStorage }
}
