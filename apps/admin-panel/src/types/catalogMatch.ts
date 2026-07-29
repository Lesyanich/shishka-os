/**
 * Types for the supplier-catalog matching queue (mig 389).
 *
 * Background: 832 catalog rows carry a real supplier price but no link to an
 * item we stock. They cannot be compared (v_price_comparison needs the link)
 * and cannot be ordered (po_lines.nomenclature_id is NOT NULL), so until they
 * are matched they are inert data. This is the surface that clears them.
 */

/** One unlinked row awaiting a decision — v_catalog_match_queue. */
export interface CatalogQueueRow {
  catalog_id: string
  supplier_id: string
  supplier_name: string
  /** Whatever the supplier called it. May be Thai, may be a full pack title. */
  raw_name: string | null
  supplier_sku: string | null
  barcode: string | null
  last_seen_price: number | null
  package_qty: number | null
  package_unit: string | null
  source: string | null
  updated_at: string | null
}

/** A candidate item for one queue row — fn_suggest_catalog_matches. */
export interface MatchSuggestion {
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string | null
  cost_per_unit: number | null
  /** 0–1. 1.0 means a shared barcode (proof), not a name guess. */
  score: number
}

/** Linked, priced, but no pack size — v_catalog_pack_missing. */
export interface PackMissingRow {
  catalog_id: string
  supplier_id: string
  supplier_name: string
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string | null
  raw_name: string | null
  last_seen_price: number | null
  package_qty: number | null
  package_unit: string | null
  updated_at: string | null
}

/** One-row scorecard — v_catalog_health. */
export interface CatalogHealth {
  rows_total: number
  rows_linked: number
  queue_pending: number
  reviewed_not_stocked: number
  pack_missing: number
  rows_comparable: number
  rows_stale_90d: number
  items_with_2plus_offers: number
  purchasable_items: number
}
