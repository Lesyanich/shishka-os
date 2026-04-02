import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CapExTransaction {
  id: string
  amount_thb: number
  transaction_date: string
  transaction_type: string
  category_code: number | null
  vendor: string | null
  details: string | null
  category_name: string | null
}

export interface CapExCategorySummary {
  category_name: string
  total: number
  count: number
}

export interface UseCapExResult {
  transactions: CapExTransaction[]
  monthlyTotal: number
  byCategory: CapExCategorySummary[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useCapEx(): UseCapExResult {
  const [transactions, setTransactions] = useState<CapExTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Two separate queries — safer than relying on implicit FK join
    const [txResult, catResult] = await Promise.all([
      supabase
        .from('capex_transactions')
        .select('id, amount_thb, transaction_date, transaction_type, category_code, vendor, details')
        .order('transaction_date', { ascending: false }),
      supabase.from('fin_categories').select('code, name'),
    ])

    if (txResult.error) {
      console.error('[useCapEx] transactions fetch error', txResult.error)
      setError(txResult.error.message)
      setIsLoading(false)
      return
    }

    const catById: Record<number, string> = {}
    for (const cat of catResult.data ?? []) {
      catById[cat.code as number] = cat.name as string
    }

    const mapped: CapExTransaction[] = (txResult.data ?? []).map((row) => ({
      id: row.id as string,
      amount_thb: Number(row.amount_thb ?? 0),
      transaction_date: row.transaction_date as string,
      transaction_type: row.transaction_type as string,
      category_code: row.category_code as number | null,
      vendor: row.vendor as string | null,
      details: row.details as string | null,
      category_name:
        row.category_code != null ? (catById[row.category_code as number] ?? null) : null,
    }))

    setTransactions(mapped)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Monthly total (current calendar month)
  const now = new Date()
  const monthlyTotal = transactions.reduce((sum, t) => {
    const d = new Date(t.transaction_date)
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      return sum + t.amount_thb
    }
    return sum
  }, 0)

  // Group by category, sorted by total descending
  const categoryMap = new Map<string, CapExCategorySummary>()
  for (const t of transactions) {
    const name = t.category_name ?? 'Uncategorized'
    if (!categoryMap.has(name)) {
      categoryMap.set(name, { category_name: name, total: 0, count: 0 })
    }
    const entry = categoryMap.get(name)!
    entry.total += t.amount_thb
    entry.count += 1
  }
  const byCategory = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total)

  return { transactions, monthlyTotal, byCategory, isLoading, error, refetch: fetchData }
}
