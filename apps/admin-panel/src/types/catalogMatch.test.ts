import { describe, it, expect } from 'vitest'
import type {
  CatalogQueueRow,
  MatchSuggestion,
  PackMissingRow,
  CatalogHealth,
} from './catalogMatch'

/**
 * Compile-time contract with mig 389. If a view drops or renames a column
 * these shapes must change with it — the danger being a `.select()` that
 * silently omits a column while the cast keeps TypeScript quiet (that trap has
 * bitten this codebase before).
 */
describe('catalogMatch types', () => {
  it('CatalogQueueRow tolerates the nullable fields the view really returns', () => {
    // raw_name is COALESCE(product_name, original_name, full_title) — all three
    // can be null, so the UI must handle a nameless row rather than assume one.
    const row: CatalogQueueRow = {
      catalog_id: 'c1',
      supplier_id: 's1',
      supplier_name: 'Makro',
      raw_name: null,
      supplier_sku: null,
      barcode: null,
      last_seen_price: null,
      package_qty: null,
      package_unit: null,
      source: null,
      updated_at: null,
    }
    expect(row.raw_name).toBeNull()
  })

  it('MatchSuggestion carries a numeric score', () => {
    const hit: MatchSuggestion = {
      nomenclature_id: 'n1',
      product_code: 'RAW-CHEESE',
      item_name: 'ARO Gouda Cheese Shredded 500 g',
      base_unit: 'kg',
      cost_per_unit: 210,
      score: 0.697,
    }
    // The RPC returns numeric, which supabase-js hands back as a string unless
    // coerced — useCatalogMatching.suggest() does the Number() conversion.
    expect(typeof hit.score).toBe('number')
  })

  it('PackMissingRow always has an item — it is linked by definition', () => {
    const row: PackMissingRow = {
      catalog_id: 'c2',
      supplier_id: 's1',
      supplier_name: 'Makro',
      nomenclature_id: 'n1',
      product_code: 'RAW-CHEESE',
      item_name: 'Cheese',
      base_unit: 'kg',
      raw_name: 'ARO Shredded Cheese 500g',
      last_seen_price: 105,
      package_qty: null,
      package_unit: null,
      updated_at: null,
    }
    expect(row.nomenclature_id).toBeTruthy()
  })

  it('CatalogHealth exposes comparable separately from linked', () => {
    // The distinction is the point of the scorecard: linking a row does not
    // make it comparable, only linking + a pack size does.
    const h: CatalogHealth = {
      rows_total: 1378,
      rows_linked: 545,
      queue_pending: 832,
      reviewed_not_stocked: 0,
      pack_missing: 101,
      rows_comparable: 194,
      rows_stale_90d: 178,
      items_with_2plus_offers: 58,
      purchasable_items: 595,
    }
    expect(h.rows_comparable).toBeLessThan(h.rows_linked)
  })
})
