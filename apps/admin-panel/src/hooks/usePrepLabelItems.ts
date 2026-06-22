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
  /** `is_available` — drives the "Active only" default filter. */
  isAvailable: boolean
  /** Shelf life in days from nomenclature (single source of truth, mig 307) —
   * prefills the label's use-by; same value drives batch expiry. */
  shelfLifeDays: number | null
  categoryId: string | null
  /** Leaf category name (with emoji), used as the section header. */
  categoryName: string | null
  /** Composite sort key (parent sort × 1000 + own sort) for ordering sections. */
  categorySort: number
}

/** Shape of the embedded category join (untyped supabase client). */
interface RawItemRow {
  id: string
  name: string
  product_code: string
  base_unit: string | null
  is_available: boolean | null
  shelf_life_days: number | null
  category_id: string | null
  category: {
    name: string | null
    sort_order: number | null
    parent: { sort_order: number | null } | null
  } | null
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
      .select(
        'id, name, product_code, base_unit, is_available, shelf_life_days, category_id, category:category_id(name, sort_order, parent:parent_id(sort_order))',
      )
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
        const rows = (data ?? []) as unknown as RawItemRow[]
        const mapped: PrepItem[] = rows.map((row) => {
          const cat = row.category
          const parentSort = cat?.parent?.sort_order ?? 999
          const ownSort = cat?.sort_order ?? 999
          return {
            id: row.id,
            name: row.name,
            product_code: row.product_code,
            base_unit: row.base_unit,
            kind: row.product_code.startsWith('SALE-') ? 'SALE' : 'PF',
            isAvailable: row.is_available ?? false,
            shelfLifeDays: row.shelf_life_days ?? null,
            categoryId: row.category_id,
            categoryName: cat?.name ?? null,
            categorySort: parentSort * 1000 + ownSort,
          }
        })
        setItems(mapped)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
