import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ────────────────────────────── Types ────────────────────────────── */

export interface CashSnapshot {
  id: string
  snapshot_date: string
  business_cash_thb: number
  business_bank_thb: number
  personal_reserve_thb: number
  notes: string | null
  created_at: string
}

export interface Obligation {
  id: string
  creditor: string
  description: string | null
  amount_thb: number
  paid_thb: number
  due_date: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'on_hold' | 'cancelled'
  source: string | null
  notes: string | null
  created_at: string
  paid_at: string | null
}

export interface BurnRate {
  daily7d: number
  daily30d: number
  total7d: number
  total30d: number
}

export interface UseFinanceDashboardResult {
  latestCash: CashSnapshot | null
  obligations: Obligation[]
  burnRate: BurnRate
  runwayDays: number
  totalOutstanding: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/* ────────────────────────────── Hook ────────────────────────────── */

export function useFinanceDashboard(): UseFinanceDashboardResult {
  const [latestCash, setLatestCash] = useState<CashSnapshot | null>(null)
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [burnRate, setBurnRate] = useState<BurnRate>({ daily7d: 0, daily30d: 0, total7d: 0, total30d: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Three parallel queries — no FK joins, just separate fetches
      const [cashRes, oblRes, expenseRes] = await Promise.all([
        // Latest cash snapshot
        supabase
          .from('cash_snapshots')
          .select('*')
          .order('snapshot_date', { ascending: false })
          .limit(1),

        // Active obligations (not cancelled)
        supabase
          .from('financial_obligations')
          .select('*')
          .neq('status', 'cancelled')
          .order('due_date', { ascending: true, nullsFirst: false }),

        // Last 30 days expenses for burn rate calc
        supabase
          .from('expense_ledger')
          .select('transaction_date, amount_thb')
          .gte('transaction_date', daysAgo(30))
          .order('transaction_date', { ascending: false }),
      ])

      if (cashRes.error) throw cashRes.error
      if (oblRes.error) throw oblRes.error
      if (expenseRes.error) throw expenseRes.error

      // Cash snapshot
      const cash = cashRes.data?.[0]
        ? mapCashSnapshot(cashRes.data[0])
        : null
      setLatestCash(cash)

      // Obligations
      const obls: Obligation[] = (oblRes.data ?? []).map(mapObligation)
      setObligations(obls)

      // Burn rate from expense_ledger
      const expenses = expenseRes.data ?? []
      const sevenDaysAgo = daysAgo(7)
      const exp7d = expenses.filter(e => (e.transaction_date as string) >= sevenDaysAgo)
      const total7d = exp7d.reduce((s, e) => s + Number(e.amount_thb ?? 0), 0)
      const total30d = expenses.reduce((s, e) => s + Number(e.amount_thb ?? 0), 0)

      const days7 = Math.max(daysBetween(sevenDaysAgo, today()), 1)
      const days30 = Math.max(daysBetween(daysAgo(30), today()), 1)

      setBurnRate({
        daily7d: total7d / days7,
        daily30d: total30d / days30,
        total7d,
        total30d,
      })

      setIsLoading(false)
    } catch (err) {
      console.error('[useFinanceDashboard] error', err)
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Computed values
  const totalBusinessCash = latestCash
    ? latestCash.business_cash_thb + latestCash.business_bank_thb
    : 0

  const totalOutstanding = obligations
    .filter(o => o.status !== 'paid')
    .reduce((s, o) => s + (o.amount_thb - o.paid_thb), 0)

  const dailyBurn = burnRate.daily30d > 0 ? burnRate.daily30d : burnRate.daily7d
  const runwayDays = dailyBurn > 0 ? Math.floor(totalBusinessCash / dailyBurn) : 999

  return {
    latestCash,
    obligations,
    burnRate,
    runwayDays,
    totalOutstanding,
    isLoading,
    error,
    refetch: fetchData,
  }
}

/* ────────────────────────────── Helpers ────────────────────────────── */

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / 86_400_000))
}

function mapCashSnapshot(r: Record<string, unknown>): CashSnapshot {
  return {
    id: r.id as string,
    snapshot_date: r.snapshot_date as string,
    business_cash_thb: Number(r.business_cash_thb ?? 0),
    business_bank_thb: Number(r.business_bank_thb ?? 0),
    personal_reserve_thb: Number(r.personal_reserve_thb ?? 0),
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
  }
}

function mapObligation(r: Record<string, unknown>): Obligation {
  return {
    id: r.id as string,
    creditor: r.creditor as string,
    description: (r.description as string) ?? null,
    amount_thb: Number(r.amount_thb ?? 0),
    paid_thb: Number(r.paid_thb ?? 0),
    due_date: (r.due_date as string) ?? null,
    priority: r.priority as Obligation['priority'],
    status: r.status as Obligation['status'],
    source: (r.source as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    paid_at: (r.paid_at as string) ?? null,
  }
}
