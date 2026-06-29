import { describe, it, expect } from 'vitest'
import { normalizeStockRow } from './useStockStatus'

describe('normalizeStockRow', () => {
  it('coerces numeric strings and preserves nulls', () => {
    const out = normalizeStockRow({
      nomenclature_id: 'n', product_code: 'RAW-X', name: 'X',
      base_unit: 'kg', storage_location: null, shelf_life_days: '7',
      cost_per_unit: '12.50', default_supplier_id: null,
      min_stock: '2', par_stock: '5', reorder_qty: null,
      on_hand: '1', last_counted_at: null, consumed_since_count: '3',
      theoretical_on_hand: '-2', live_batches: '0', next_expiry: null,
      expiring_soon: '0', expired: '0', suggested_qty: '4', stock_status: 'low',
    })
    expect(out.shelf_life_days).toBe(7)
    expect(out.cost_per_unit).toBe(12.5)
    expect(out.reorder_qty).toBeNull()
    expect(out.on_hand).toBe(1)
    expect(out.theoretical_on_hand).toBe(-2)
    expect(out.suggested_qty).toBe(4)
    expect(out.stock_status).toBe('low')
  })

  it('defaults missing numeric aggregates to 0', () => {
    const out = normalizeStockRow({
      nomenclature_id: 'n', product_code: 'RAW-Y', name: 'Y',
      base_unit: null, storage_location: null, shelf_life_days: null,
      cost_per_unit: null, default_supplier_id: null,
      min_stock: null, par_stock: null, reorder_qty: null,
      on_hand: null, last_counted_at: null, consumed_since_count: null,
      theoretical_on_hand: null, live_batches: null, next_expiry: null,
      expiring_soon: null, expired: null, suggested_qty: null, stock_status: 'untracked',
    })
    expect(out.on_hand).toBe(0)
    expect(out.consumed_since_count).toBe(0)
    expect(out.min_stock).toBeNull()
    expect(out.suggested_qty).toBeNull()
  })
})
