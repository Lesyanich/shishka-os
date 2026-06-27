import { describe, it, expect } from 'vitest'
import {
  normalizeSupplier,
  toggleDeliveryDay,
  shapeSupplierPatch,
  type WeekdayCode,
} from './useSuppliers'

describe('normalizeSupplier', () => {
  it('parses numbers and sorts delivery days Mon→Sun', () => {
    const s = normalizeSupplier({
      id: 'a',
      name: 'Makro',
      contact_person: null,
      phone: null,
      contact_info: 'legacy blob',
      delivery_days: ['fri', 'mon', 'wed'],
      delivery_window: null,
      lead_time_days: '2',
      min_order_thb: '500.50',
      payment_terms: null,
      notes: null,
    })
    expect(s.delivery_days).toEqual(['mon', 'wed', 'fri'])
    expect(s.lead_time_days).toBe(2)
    expect(s.min_order_thb).toBe(500.5)
    expect(s.contact_info).toBe('legacy blob')
  })

  it('drops unknown weekday codes and defaults missing arrays', () => {
    const s = normalizeSupplier({
      id: 'b',
      name: 'X',
      contact_person: null,
      phone: null,
      contact_info: null,
      delivery_days: ['mon', 'funday' as WeekdayCode],
      delivery_window: null,
      lead_time_days: null,
      min_order_thb: null,
      payment_terms: null,
      notes: null,
    })
    expect(s.delivery_days).toEqual(['mon'])
    expect(s.lead_time_days).toBeNull()
  })
})

describe('toggleDeliveryDay', () => {
  it('adds a day and keeps the array sorted', () => {
    expect(toggleDeliveryDay(['mon', 'fri'], 'wed')).toEqual(['mon', 'wed', 'fri'])
  })
  it('removes a day already present', () => {
    expect(toggleDeliveryDay(['mon', 'wed', 'fri'], 'wed')).toEqual(['mon', 'fri'])
  })
})

describe('shapeSupplierPatch', () => {
  it('trims strings and nulls out emptied fields', () => {
    expect(shapeSupplierPatch({ phone: '  ', contact_person: '  Som  ' })).toEqual({
      phone: null,
      contact_person: 'Som',
    })
  })
  it('passes through delivery_days and numeric fields untouched', () => {
    expect(shapeSupplierPatch({ delivery_days: ['mon'], lead_time_days: 3 })).toEqual({
      delivery_days: ['mon'],
      lead_time_days: 3,
    })
  })
  it('coerces a missing delivery_days to an empty array', () => {
    expect(shapeSupplierPatch({ delivery_days: undefined as unknown as WeekdayCode[] })).toEqual({
      delivery_days: [],
    })
  })
})
