import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** What kind of nomenclature item a label is for: a semi-finished prep (PF-),
 * a finished dish (SALE-), or a bought pantry staple in a jar/bottle (RAW-). */
export type PrepItemKind = 'PF' | 'SALE' | 'RAW'

/** A prep (PF) or finished dish (SALE) item the kitchen can print a storage label for. */
export interface PrepItem {
  id: string
  /** Procurement name (brand + pack size for RAW). Source of truth for buying. */
  name: string
  /** Clean culinary name for labels/pickers: `customer_short_name` if set, else
   * `name`. RAW items carry brandy invoice names, so this keeps stickers clean. */
  displayName: string
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
export interface RawItemRow {
  id: string
  name: string
  customer_short_name: string | null
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

/** Columns every label picker needs — no cost/price, so the cook tier never
 * receives financial data. Shared by the PF/SALE and RAW (pantry) hooks. */
export const ITEM_SELECT =
  'id, name, customer_short_name, product_code, base_unit, is_available, shelf_life_days, category_id, category:category_id(name, sort_order, parent:parent_id(sort_order))'

/** Derive the item kind from its product_code prefix. */
export function kindFromCode(productCode: string): PrepItemKind {
  if (productCode.startsWith('SALE-')) return 'SALE'
  if (productCode.startsWith('RAW-')) return 'RAW'
  return 'PF'
}

/** Map a raw nomenclature row (with embedded category) to a `PrepItem`. */
export function mapItemRow(row: RawItemRow): PrepItem {
  const cat = row.category
  const parentSort = cat?.parent?.sort_order ?? 999
  const ownSort = cat?.sort_order ?? 999
  const kind = kindFromCode(row.product_code)
  // RAW items carry a brandy procurement name ("ARO Black Pepper 500 g") — show
  // the clean culinary name on labels/pickers. PF/SALE names are already clean.
  const shortName = row.customer_short_name?.trim()
  const displayName = kind === 'RAW' && shortName ? shortName : row.name
  return {
    id: row.id,
    name: row.name,
    displayName,
    product_code: row.product_code,
    base_unit: row.base_unit,
    kind,
    isAvailable: row.is_available ?? false,
    shelfLifeDays: row.shelf_life_days ?? null,
    categoryId: row.category_id,
    categoryName: cat?.name ?? null,
    categorySort: parentSort * 1000 + ownSort,
  }
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
      .select(ITEM_SELECT)
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
        setItems(rows.map(mapItemRow))
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
