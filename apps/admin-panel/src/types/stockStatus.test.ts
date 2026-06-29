import { describe, it, expect } from 'vitest'
import {
  STOCK_STATUS_META,
  compareStockRows,
  isParBelowMin,
  type StockStatusRow,
} from './stockStatus'

function row(p: Partial<StockStatusRow>): StockStatusRow {
  return {
    nomenclature_id: 'n', product_code: 'RAW-X', name: 'X', base_unit: 'kg',
    storage_location: null, shelf_life_days: null, cost_per_unit: null,
    default_supplier_id: null, min_stock: null, par_stock: null, reorder_qty: null,
    on_hand: 0, last_counted_at: null, consumed_since_count: 0, theoretical_on_hand: 0,
    live_batches: 0, next_expiry: null, expiring_soon: 0, expired: 0,
    suggested_qty: null, stock_status: 'untracked',
    ...p,
  }
}

describe('STOCK_STATUS_META', () => {
  it('ranks out < low < ok < untracked', () => {
    expect(STOCK_STATUS_META.out.rank).toBeLessThan(STOCK_STATUS_META.low.rank)
    expect(STOCK_STATUS_META.low.rank).toBeLessThan(STOCK_STATUS_META.ok.rank)
    expect(STOCK_STATUS_META.ok.rank).toBeLessThan(STOCK_STATUS_META.untracked.rank)
  })
})

describe('compareStockRows', () => {
  it('sorts by status severity first', () => {
    const rows = [
      row({ name: 'B', stock_status: 'ok' }),
      row({ name: 'A', stock_status: 'out' }),
      row({ name: 'C', stock_status: 'low' }),
    ].sort(compareStockRows)
    expect(rows.map((r) => r.stock_status)).toEqual(['out', 'low', 'ok'])
  })
  it('breaks ties by name', () => {
    const rows = [
      row({ name: 'Zucchini', stock_status: 'low' }),
      row({ name: 'Apple', stock_status: 'low' }),
    ].sort(compareStockRows)
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'Zucchini'])
  })
})

describe('isParBelowMin', () => {
  it('flags par < min', () => {
    expect(isParBelowMin({ min_stock: 5, par_stock: 3 })).toBe(true)
  })
  it('is false when par >= min or either is null', () => {
    expect(isParBelowMin({ min_stock: 5, par_stock: 5 })).toBe(false)
    expect(isParBelowMin({ min_stock: null, par_stock: 3 })).toBe(false)
    expect(isParBelowMin({ min_stock: 5, par_stock: null })).toBe(false)
  })
})
