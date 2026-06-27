import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Which families of items expose a shelf life worth editing here. */
export type ShelfKind = 'PF' | 'SALE'

export interface ShelfLifeItem {
  id: string
  product_code: string
  name: string
  customer_short_name: string | null
  kind: ShelfKind
  base_unit: string | null
  storage_location: string | null
  shelf_life_days: number | null
  is_available: boolean
}

export interface MutationResult {
  ok: boolean
  error?: string
}

/** Pure: derive the item family from its product_code. Exported for testing. */
export function classifyShelfKind(productCode: string): ShelfKind | null {
  if (productCode.startsWith('PF-')) return 'PF'
  if (productCode.startsWith('SALE-')) return 'SALE'
  return null
}

const SELECT_COLS =
  'id, product_code, name, customer_short_name, base_unit, storage_location, shelf_life_days, is_available'

interface RawRow {
  id: string
  product_code: string
  name: string
  customer_short_name: string | null
  base_unit: string | null
  storage_location: string | null
  shelf_life_days: number | string | null
  is_available: boolean
}

function normalize(row: RawRow): ShelfLifeItem | null {
  const kind = classifyShelfKind(row.product_code)
  if (!kind) return null
  return {
    id: row.id,
    product_code: row.product_code,
    name: row.name,
    customer_short_name: row.customer_short_name ?? null,
    kind,
    base_unit: row.base_unit ?? null,
    storage_location: row.storage_location ?? null,
    shelf_life_days: row.shelf_life_days != null ? Number(row.shelf_life_days) : null,
    is_available: row.is_available,
  }
}

export interface UseShelfLifeItemsResult {
  items: ShelfLifeItem[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Direct write to nomenclature.shelf_life_days — NOT trigger-managed
   * (unlike cost_per_unit, which must never be written directly). */
  updateShelfLife: (id: string, days: number | null) => Promise<MutationResult>
}

/** Loads PF + SALE nomenclature for the procurement shelf-life editor and
 * lets the owner set shelf_life_days inline (the input that drives batch
 * expiry and, later, prep forecasting). */
export function useShelfLifeItems(): UseShelfLifeItemsResult {
  const [items, setItems] = useState<ShelfLifeItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('nomenclature')
      .select(SELECT_COLS)
      .or('product_code.like.PF-%,product_code.like.SALE-%')
      .eq('is_deleted', false)
      .order('product_code', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setItems(
        (data ?? [])
          .map((r) => normalize(r as RawRow))
          .filter((x): x is ShelfLifeItem => x !== null),
      )
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const updateShelfLife = useCallback(async (id: string, days: number | null) => {
    if (days != null && (!Number.isFinite(days) || days < 0)) {
      return { ok: false, error: 'Shelf life must be 0 or more days' }
    }
    const { error: updateError } = await supabase
      .from('nomenclature')
      .update({ shelf_life_days: days })
      .eq('id', id)
    if (updateError) return { ok: false, error: updateError.message }
    return { ok: true }
  }, [])

  return { items, isLoading, error, refetch: fetchItems, updateShelfLife }
}
