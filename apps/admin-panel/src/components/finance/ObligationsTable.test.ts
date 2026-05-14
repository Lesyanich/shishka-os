import { describe, it, expect } from 'vitest'
import type { Obligation } from '../../hooks/useFinanceDashboard'

describe('ObligationsTable', () => {
  const obligations: Obligation[] = [
    { id: '1', creditor: 'Tops', description: 'Rent', amount_thb: 60000, paid_thb: 60000, due_date: '2026-05-13', priority: 'critical', status: 'paid', source: null, notes: null, created_at: '', paid_at: null },
    { id: '2', creditor: 'Richie', description: 'Loan', amount_thb: 70000, paid_thb: 10000, due_date: '2026-07-13', priority: 'high', status: 'partial', source: null, notes: null, created_at: '', paid_at: null },
    { id: '3', creditor: 'Sign-board', description: 'Debt', amount_thb: 30000, paid_thb: 0, due_date: null, priority: 'low', status: 'on_hold', source: null, notes: null, created_at: '', paid_at: null },
  ]

  it('computes total outstanding excluding paid', () => {
    const totalOutstanding = obligations
      .filter(o => o.status !== 'paid')
      .reduce((s, o) => s + (o.amount_thb - o.paid_thb), 0)
    expect(totalOutstanding).toBe(90000) // Richie 60k + sign-board 30k
  })

  it('separates active from paid obligations', () => {
    const active = obligations.filter(o => o.status !== 'paid')
    const paid = obligations.filter(o => o.status === 'paid')
    expect(active).toHaveLength(2)
    expect(paid).toHaveLength(1)
  })
})
