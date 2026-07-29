import { describe, it, expect } from 'vitest'
import { buildCopyOrderText } from './PODetail'
import type { PurchaseOrder, POLine } from '../../types/procurement'

const order: PurchaseOrder = {
  id: 'po-1',
  po_number: 'PO-0012',
  supplier_id: 'sup-1',
  supplier_name: 'DOY FRESH',
  status: 'submitted',
  expected_date: '2026-07-31',
  delivery_window: '06:00–09:00',
  notes: null,
  subtotal: 2450,
  discount_total: 0,
  vat_amount: 0,
  delivery_fee: 0,
  grand_total: 2450,
  deliver_to_station_id: null,
  created_by: null,
  author_name: 'Lesia',
  created_at: '2026-07-27T09:12:00Z',
  line_count: 2,
  supplier_phone: null,
  supplier_line_id: null,
  supplier_website: null,
  supplier_default_delivery_fee: null,
  archived_at: null,
}

const line = (over: Partial<POLine>): POLine => ({
  id: 'l1',
  po_id: 'po-1',
  nomenclature_id: 'n1',
  sku_id: null,
  product_name: 'Bell pepper red',
  product_name_th: null,
  product_code: 'RAW-PEPPER',
  base_unit: 'kg',
  qty_ordered: 5,
  unit: 'kg',
  unit_price_expected: 58,
  total_expected: 290,
  destination_station_id: null,
  sort_order: 1,
  notes: null,
  ...over,
})

describe('buildCopyOrderText', () => {
  it('is a supplier-ready message: header, delivery slot, lines, total', () => {
    const text = buildCopyOrderText(order, [line({})])
    expect(text).toContain('Order PO-0012 — Shishka')
    expect(text).toContain('06:00–09:00')
    expect(text).toContain('• Bell pepper red — 5 kg')
    expect(text).toContain('Total: ฿2,450')
  })

  it('carries Thai names — this text is the one place they belong (spec §6.4)', () => {
    const text = buildCopyOrderText(order, [line({ product_name_th: 'พริกหวานแดง' })])
    expect(text).toContain('Bell pepper red (พริกหวานแดง)')
  })

  it('omits the Thai parens when the catalog has no Thai name', () => {
    expect(buildCopyOrderText(order, [line({})])).not.toContain('(')
  })

  it('drops the delivery line when no date is set yet', () => {
    const text = buildCopyOrderText({ ...order, expected_date: null }, [line({})])
    expect(text).not.toContain('Delivery:')
  })

  it('omits the total on an order with nothing priced', () => {
    const text = buildCopyOrderText({ ...order, grand_total: 0 }, [line({})])
    expect(text).not.toContain('Total:')
  })

  it('falls back to base_unit when the line carries no unit', () => {
    const text = buildCopyOrderText(order, [line({ unit: '' })])
    expect(text).toContain('5 kg')
  })
})
