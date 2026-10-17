import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ITEM_SELECT, mapItemRow, type PrepItem, type RawItemRow } from './usePrepLabelItems'

/** Slug of the ops tag that curates which RAW items show on the pantry tab
 * (seeded by migration 326). Adding/removing this tag on a nomenclature row is
 * the data-driven way to extend or trim the "Jars & Bottles" list. */
export const PANTRY_LABEL_TAG = 'pantry-label'

/** A junction row with its nomenclature (+category) embedded. */
interface TaggedRow {
  nomenclature: (RawItemRow & { is_deleted: boolean | null }) | null
}

/**
 * Bought pantry staples stored in jars & bottles (oils, vinegars, spices, seeds,
 * sauces, pastes, sweeteners, dry goods…) that the kitchen decants and labels
 * with an opened-on / use-by sticker + QR. The set is curated by the
 * `pantry-label` tag rather than dumping all ~300 RAW items (most of which are
 * fresh produce / proteins that never get a jar label).
 *
 * Queries from `nomenclature_tags` (the same FK-embed direction the menu hooks
 * use) filtered to the pantry tag, then keeps the active RAW rows. Returns the
 * same `PrepItem` shape as `usePrepLabelItems` (kind = 'RAW') so the picker +
 * label editor are shared. No cost/price columns — cook-tier safe.
 */
export function usePantryLabelItems() {
  const [items, setItems] = useState<PrepItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('nomenclature_tags')
      .select(`nomenclature:nomenclature_id(${ITEM_SELECT}, is_deleted), tag:tag_id!inner(slug)`)
      .eq('tag.slug', PANTRY_LABEL_TAG)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        const rows = (data ?? []) as unknown as TaggedRow[]
        const mapped = rows
          .map((r) => r.nomenclature)
          .filter(
            (n): n is RawItemRow & { is_deleted: boolean | null } =>
              !!n && n.product_code.startsWith('RAW-') && n.is_deleted !== true,
          )
          .map(mapItemRow)
          .sort((a, b) => a.name.localeCompare(b.name))
        setItems(mapped)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
