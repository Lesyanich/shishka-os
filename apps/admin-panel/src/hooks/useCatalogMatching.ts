import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  CatalogQueueRow,
  MatchSuggestion,
  PackMissingRow,
  CatalogHealth,
} from '../types/catalogMatch'

/**
 * Score at or above which a suggestion is safe to accept without reading the
 * candidate list. Calibrated on real orphans: an exact name repeat scores 1.00,
 * "ARO Shredded Cheese 500g" -> "ARO Gouda Cheese Shredded 500 g" scores 0.70,
 * and unrelated pairs (Ovaltine -> Sea Salt) land near 0.17. 0.85 keeps the
 * one-click path to cases where the names are effectively the same string.
 */
export const CONFIDENT_MATCH = 0.85

/**
 * Below this, a suggestion is noise and showing it invites a wrong link — the
 * queue tells the user to search manually instead of offering a bad guess.
 */
export const USABLE_MATCH = 0.35

const QUEUE_COLS =
  'catalog_id, supplier_id, supplier_name, raw_name, supplier_sku, barcode, last_seen_price, package_qty, package_unit, source, updated_at'
const PACK_COLS =
  'catalog_id, supplier_id, supplier_name, nomenclature_id, product_code, item_name, base_unit, raw_name, last_seen_price, package_qty, package_unit, updated_at'

export interface UseCatalogMatchingResult {
  queue: CatalogQueueRow[]
  packMissing: PackMissingRow[]
  health: CatalogHealth | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Candidates for one row, fetched when the user opens it. */
  suggest: (catalogId: string) => Promise<MatchSuggestion[]>
  linkRow: (
    catalogId: string,
    nomenclatureId: string,
    pack?: { conversionFactor?: number; packageQty?: number; packageUnit?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  /** "Not something we stock" — leaves the queue, stays in the catalog. */
  dismissRow: (catalogId: string) => Promise<{ ok: boolean; error?: string }>
  setPack: (
    catalogId: string,
    conversionFactor: number,
    packageQty?: number,
    packageUnit?: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

/** Data layer for the catalog matching queue (mig 389). */
export function useCatalogMatching(): UseCatalogMatchingResult {
  const [queue, setQueue] = useState<CatalogQueueRow[]>([])
  const [packMissing, setPackMissing] = useState<PackMissingRow[]>([])
  const [health, setHealth] = useState<CatalogHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [q, p, h] = await Promise.all([
      supabase.from('v_catalog_match_queue').select(QUEUE_COLS).order('supplier_name').limit(500),
      supabase.from('v_catalog_pack_missing').select(PACK_COLS).order('item_name').limit(500),
      supabase.from('v_catalog_health').select('*').maybeSingle(),
    ])
    if (q.error) setError(q.error.message)
    setQueue((q.data ?? []) as CatalogQueueRow[])
    setPackMissing((p.data ?? []) as PackMissingRow[])
    setHealth((h.data as CatalogHealth | null) ?? null)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const suggest = useCallback(async (catalogId: string): Promise<MatchSuggestion[]> => {
    const { data, error: rpcError } = await supabase.rpc('fn_suggest_catalog_matches', {
      p_catalog_id: catalogId,
      p_limit: 6,
    })
    if (rpcError || !data) return []
    return (data as MatchSuggestion[]).map((s) => ({ ...s, score: Number(s.score) }))
  }, [])

  /** Every RPC here returns { ok, error }; unwrap it the same way each time. */
  const callRpc = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
      const { data, error: rpcError } = await supabase.rpc(fn, args)
      if (rpcError) return { ok: false, error: rpcError.message }
      return (data as { ok: boolean; error?: string } | null) ?? {
        ok: false,
        error: 'No response from server',
      }
    },
    [],
  )

  const linkRow = useCallback<UseCatalogMatchingResult['linkRow']>(
    async (catalogId, nomenclatureId, pack) => {
      const result = await callRpc('fn_link_catalog_row', {
        p_catalog_id: catalogId,
        p_nomenclature_id: nomenclatureId,
        p_conversion_factor: pack?.conversionFactor ?? null,
        p_package_qty: pack?.packageQty ?? null,
        p_package_unit: pack?.packageUnit ?? null,
      })
      // Drop it locally rather than refetching the whole queue: with 800+ rows
      // a full reload on every link makes the screen unusable to work through.
      if (result.ok) {
        setQueue((prev) => prev.filter((r) => r.catalog_id !== catalogId))
        setHealth((prev) =>
          prev
            ? {
                ...prev,
                queue_pending: Math.max(0, prev.queue_pending - 1),
                rows_linked: prev.rows_linked + 1,
                // Linking without a pack size does not make the row comparable
                // — it only turns an invisible row into a visible unpriced one.
                rows_comparable: prev.rows_comparable + (pack?.conversionFactor ? 1 : 0),
                pack_missing: prev.pack_missing + (pack?.conversionFactor ? 0 : 1),
              }
            : prev,
        )
      }
      return result
    },
    [callRpc],
  )

  const dismissRow = useCallback<UseCatalogMatchingResult['dismissRow']>(
    async (catalogId) => {
      const result = await callRpc('fn_dismiss_catalog_row', {
        p_catalog_id: catalogId,
        p_reviewed: true,
      })
      if (result.ok) {
        setQueue((prev) => prev.filter((r) => r.catalog_id !== catalogId))
        setHealth((prev) =>
          prev
            ? {
                ...prev,
                queue_pending: Math.max(0, prev.queue_pending - 1),
                reviewed_not_stocked: prev.reviewed_not_stocked + 1,
              }
            : prev,
        )
      }
      return result
    },
    [callRpc],
  )

  const setPack = useCallback<UseCatalogMatchingResult['setPack']>(
    async (catalogId, conversionFactor, packageQty, packageUnit) => {
      const result = await callRpc('fn_set_catalog_pack', {
        p_catalog_id: catalogId,
        p_conversion_factor: conversionFactor,
        p_package_qty: packageQty ?? null,
        p_package_unit: packageUnit ?? null,
      })
      if (result.ok) {
        setPackMissing((prev) => prev.filter((r) => r.catalog_id !== catalogId))
        setHealth((prev) =>
          prev
            ? {
                ...prev,
                pack_missing: Math.max(0, prev.pack_missing - 1),
                rows_comparable: prev.rows_comparable + 1,
              }
            : prev,
        )
      }
      return result
    },
    [callRpc],
  )

  return { queue, packMissing, health, isLoading, error, refetch: fetchAll, suggest, linkRow, dismissRow, setPack }
}
