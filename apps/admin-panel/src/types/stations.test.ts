import { describe, expect, it } from 'vitest'
import {
  compareChecklistRows,
  normalizeChecklistRow,
  type RawChecklistRow,
  type StationChecklistRow,
} from './stations'

const raw = (over: Partial<RawChecklistRow> = {}): RawChecklistRow => ({
  station_id: 'st-1',
  station_code: 'bar',
  nomenclature_id: 'n-1',
  product_code: 'RAW-X',
  name: 'X',
  base_unit: 'kg',
  type: 'raw_ingredient',
  item_kind: 'food',
  cost_per_unit: '189.0000',
  count_class: 'A',
  batch_on_hand: '2.5',
  next_expiry: null,
  expiring_soon: '0',
  expired: null,
  last_count: null,
  last_count_at: null,
  min_stock: '3',
  par_stock: '10',
  is_due_today: true,
  ...over,
})

describe('normalizeChecklistRow', () => {
  it('coerces PostgREST numeric strings to numbers', () => {
    const r = normalizeChecklistRow(raw())
    expect(r.cost_per_unit).toBe(189)
    expect(r.batch_on_hand).toBe(2.5)
    expect(r.min_stock).toBe(3)
    expect(r.par_stock).toBe(10)
    expect(r.expired).toBe(0) // null count fields default to 0
  })

  it('keeps null last_count as null (never counted ≠ counted zero)', () => {
    const r = normalizeChecklistRow(raw({ last_count: null }))
    expect(r.last_count).toBeNull()
    const r2 = normalizeChecklistRow(raw({ last_count: '0' }))
    expect(r2.last_count).toBe(0)
  })

  it('defaults unknown item_kind to food and bad count_class to null', () => {
    const r = normalizeChecklistRow(raw({ item_kind: 'weird', count_class: 'Z' }))
    expect(r.item_kind).toBe('food')
    expect(r.count_class).toBeNull()
  })

  it('null is_due_today is treated as due (never counted)', () => {
    const r = normalizeChecklistRow(raw({ is_due_today: null }))
    expect(r.is_due_today).toBe(true)
  })
})

describe('compareChecklistRows', () => {
  const row = (over: Partial<StationChecklistRow>): StationChecklistRow =>
    normalizeChecklistRow(raw()) && { ...normalizeChecklistRow(raw()), ...over }

  it('due items come first', () => {
    const a = row({ is_due_today: false, name: 'Aaa' })
    const b = row({ is_due_today: true, name: 'Zzz' })
    expect([a, b].sort(compareChecklistRows)[0].name).toBe('Zzz')
  })

  it('within same due state, A-class before B before C before unclassed', () => {
    const a = row({ count_class: 'C', name: 'c-item' })
    const b = row({ count_class: 'A', name: 'a-item' })
    const c = row({ count_class: null, name: 'null-item' })
    const d = row({ count_class: 'B', name: 'b-item' })
    const sorted = [a, b, c, d].sort(compareChecklistRows).map((r) => r.name)
    expect(sorted).toEqual(['a-item', 'b-item', 'c-item', 'null-item'])
  })

  it('ties break alphabetically by name', () => {
    const a = row({ name: 'Mango' })
    const b = row({ name: 'Avocado' })
    expect([a, b].sort(compareChecklistRows)[0].name).toBe('Avocado')
  })
})
