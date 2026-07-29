export type SourceFamily = 'quote' | 'receipt' | 'scrape' | 'manual'
export type ItemGroup = 'packaging' | 'ingredient' | 'resale'

/** One row of v_price_comparison_summary — a single item with rolled-up stats. */
export interface PriceSummaryRow {
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string | null
  current_cost: number | null
  item_group: ItemGroup
  /** Offers we hold for this item, comparable or not. */
  supplier_count: number
  /**
   * Offers with an honest per-unit price (mig 388). Lower than `supplier_count`
   * whenever a supplier's pack size is unknown — that gap is the item's data
   * debt, and the UI must show it rather than implying every offer is priced.
   */
  priced_supplier_count: number
  best_price: number | null
  worst_price: number | null
  avg_price: number | null
  best_supplier: string | null
  spread_pct: number | null
}

/** One row of v_price_comparison — a single supplier's price for one item. */
export interface PriceQuoteRow {
  nomenclature_id: string
  catalog_id: string
  supplier_id: string
  supplier_name: string
  last_seen_price: number | null
  /**
   * Per-base-unit price, or NULL when the pack size is unknown (mig 388).
   * Never fall back to `last_seen_price` here — that was exactly the old bug:
   * a pack price shown as if it were a unit price.
   */
  unit_cost: number | null
  /** False = we do not know what the quoted price buys. */
  pack_known: boolean
  source_family: SourceFamily
  product_name: string | null
  original_name: string | null
  verified_at: string | null
  updated_at: string | null
}

export interface QuoteInput {
  nomenclature_id: string
  unit_price: number
  supplier_name?: string
  supplier_id?: string
  note?: string
}

export interface RpcResult {
  ok: boolean
  error?: string
}
