export type SourceFamily = 'quote' | 'receipt' | 'scrape' | 'manual'
export type ItemGroup = 'packaging' | 'ingredient'

/** One row of v_price_comparison_summary — a single item with rolled-up stats. */
export interface PriceSummaryRow {
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string | null
  current_cost: number | null
  item_group: ItemGroup
  supplier_count: number
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
  unit_cost: number | null
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
