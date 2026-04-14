import { describe, it, expect } from 'vitest'
import { parseQuickExpense } from './parseQuickExpense'

describe('parseQuickExpense', () => {
  it('parses supplier + amount', () => {
    const r = parseQuickExpense('макро 3500')
    expect(r.supplier_hint).toBe('SIAM MAKRO')
    expect(r.amount_hint).toBe(3500)
  })

  it('parses amount with бат suffix', () => {
    const r = parseQuickExpense('вода 200 бат')
    expect(r.supplier_hint).toBe('Water Delivery')
    expect(r.amount_hint).toBe(200)
  })

  it('parses English input', () => {
    const r = parseQuickExpense('ice 150')
    expect(r.supplier_hint).toBe('Ice Supplier')
    expect(r.amount_hint).toBe(150)
  })

  it('defaults date to today', () => {
    const r = parseQuickExpense('gas 300')
    expect(r.receipt_date).toBe(new Date().toISOString().slice(0, 10))
  })

  it('parses yesterday', () => {
    const r = parseQuickExpense('market 500 вчера')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(r.receipt_date).toBe(yesterday.toISOString().slice(0, 10))
    expect(r.supplier_hint).toBe('Local Market')
  })

  it('uses remaining text as supplier when no alias matches', () => {
    const r = parseQuickExpense('Somchai Seafood 1200')
    expect(r.supplier_hint).toBe('Somchai Seafood')
    expect(r.amount_hint).toBe(1200)
  })

  it('handles empty input', () => {
    const r = parseQuickExpense('')
    expect(r.supplier_hint).toBeNull()
    expect(r.amount_hint).toBeNull()
  })
})
