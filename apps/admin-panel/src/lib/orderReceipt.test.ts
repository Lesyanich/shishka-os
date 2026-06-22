import { describe, it, expect } from 'vitest'
import { toReceiptPayload, type ReceiptOrderInfo, type ReceiptLine } from './orderReceipt'

const baseInfo: ReceiptOrderInfo = {
  orderCode: '042',
  total: 240,
  customerName: 'Mint',
  notes: 'no ice',
  fulfillmentType: 'pickup',
  tableNumber: null,
  paymentStatus: 'unpaid',
}
const lines: ReceiptLine[] = [{ name: 'Chicken Roll', quantity: 2, price: 120 }]

describe('toReceiptPayload', () => {
  it('maps order info and lines into a print payload', () => {
    const p = toReceiptPayload(baseInfo, lines, 'customer')
    expect(p.orderCode).toBe('042')
    expect(p.kind).toBe('customer')
    expect(p.total).toBe(240)
    expect(p.customerName).toBe('Mint')
    expect(p.fulfillmentType).toBe('pickup')
    expect(p.items).toEqual([{ name: 'Chicken Roll', quantity: 2, price: 120 }])
  })

  it('sets paid=true only when payment_status is exactly "paid"', () => {
    expect(toReceiptPayload({ ...baseInfo, paymentStatus: 'paid' }, lines, 'assembly').paid).toBe(true)
    expect(toReceiptPayload({ ...baseInfo, paymentStatus: 'unpaid' }, lines, 'assembly').paid).toBe(false)
    expect(toReceiptPayload({ ...baseInfo, paymentStatus: null }, lines, 'assembly').paid).toBe(false)
  })

  it('passes through the ticket kind', () => {
    expect(toReceiptPayload(baseInfo, lines, 'assembly').kind).toBe('assembly')
    expect(toReceiptPayload(baseInfo, lines, 'customer').kind).toBe('customer')
  })

  it('normalizes nullish optional fields to null and accepts empty lines', () => {
    const p = toReceiptPayload({ orderCode: '1', total: 0 }, [], 'customer')
    expect(p.customerName).toBeNull()
    expect(p.notes).toBeNull()
    expect(p.tableNumber).toBeNull()
    expect(p.items).toEqual([])
  })
})
