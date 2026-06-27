import { describe, it, expect } from 'vitest'
import type { PriceSummaryRow, PriceQuoteRow, QuoteInput, SourceFamily, ItemGroup } from './priceBook'

describe('priceBook types', () => {
  it('PriceSummaryRow is shaped as expected', () => {
    const group: ItemGroup = 'packaging'
    const row: PriceSummaryRow = {
      nomenclature_id: 'n1',
      product_code: 'RAW-CUP_PAPER_8OZ',
      item_name: '8oz Paper Cup',
      base_unit: 'pcs',
      current_cost: 2.38,
      item_group: group,
      supplier_count: 2,
      best_price: 2.1,
      worst_price: 2.6,
      avg_price: 2.35,
      best_supplier: 'Sangdamrong',
      spread_pct: 23.8,
    }
    expect(row.item_group).toBe('packaging')
    expect(row.supplier_count).toBe(2)
  })

  it('PriceQuoteRow + QuoteInput accept the documented source families', () => {
    const fam: SourceFamily = 'quote'
    const quote: PriceQuoteRow = {
      nomenclature_id: 'n1',
      catalog_id: 'c1',
      supplier_id: 's1',
      supplier_name: 'Makro',
      last_seen_price: 2.5,
      unit_cost: 2.5,
      source_family: fam,
      product_name: null,
      original_name: null,
      verified_at: null,
      updated_at: null,
    }
    const input: QuoteInput = { nomenclature_id: 'n1', unit_price: 2.5, supplier_name: 'Makro' }
    expect(quote.source_family).toBe('quote')
    expect(input.unit_price).toBe(2.5)
  })
})
