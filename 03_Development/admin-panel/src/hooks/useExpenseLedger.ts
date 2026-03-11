import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ────────────────────────────── Types ────────────────────────────── */

export interface ExpenseRow {
  id: string
  transaction_date: string
  flow_type: 'OpEx' | 'CapEx'
  category_code: number | null
  sub_category_code: number | null
  supplier_id: string | null
  details: string
  amount_original: number
  currency: string
  exchange_rate: number
  amount_thb: number
  paid_by: string
  payment_method: string
  status: string
  receipt_supplier_url: string | null
  receipt_bank_url: string | null
  tax_invoice_url: string | null
  comments: string | null
  has_tax_invoice: boolean
  created_at: string
  // Joined
  category_name: string | null
  sub_category_name: string | null
  supplier_name: string | null
}

export interface FinCategory {
  code: number
  name: string
}

export interface FinSubCategory {
  sub_code: number
  category_code: number
  name: string
}

export interface Supplier {
  id: string
  name: string
}

export interface MonthlySummary {
  month: string          // YYYY-MM
  total_thb: number
  by_category: Record<string, number>
}

export interface ExpenseUpdatePayload {
  transaction_date?: string
  flow_type?: 'OpEx' | 'CapEx'
  category_code?: number | null
  sub_category_code?: number | null
  supplier_id?: string | null
  details?: string
  amount_original?: number
  currency?: string
  exchange_rate?: number
  paid_by?: string
  payment_method?: string
  status?: string
  receipt_supplier_url?: string | null
  receipt_bank_url?: string | null
  tax_invoice_url?: string | null
  comments?: string | null
  has_tax_invoice?: boolean
}

export interface UseExpenseLedgerResult {
  rows: ExpenseRow[]
  categories: FinCategory[]
  subCategories: FinSubCategory[]
  suppliers: Supplier[]
  monthlySummaries: MonthlySummary[]
  grandTotal: number
  isLoading: boolean
  error: string | null
  refetch: () => void
  updateExpense: (id: string, payload: ExpenseUpdatePayload) => Promise<string | null>
}

/* ──────────────────────── Hook ──────────────────────── */

export function useExpenseLedger(): UseExpenseLedgerResult {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [categories, setCategories] = useState<FinCategory[]>([])
  const [subCategories, setSubCategories] = useState<FinSubCategory[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Separate queries + JS join — per CLAUDE.md rule #3
    // This pattern is equivalent to LEFT JOIN: rows with NULL category_code
    // are still returned — they just get category_name = null in JS mapping.
    // NEVER use `.select('*, fin_categories(name)')` which acts as INNER JOIN
    // and would silently hide rows where the FK is NULL.
    const [ledgerRes, catRes, subCatRes, supRes] = await Promise.all([
      supabase
        .from('expense_ledger')
        .select('*')
        .order('transaction_date', { ascending: false }),
      supabase.from('fin_categories').select('code, name').order('code'),
      supabase.from('fin_sub_categories').select('sub_code, category_code, name').order('sub_code'),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name'),
    ])

    if (ledgerRes.error) {
      console.error('[useExpenseLedger] ledger error', ledgerRes.error)
      setError(ledgerRes.error.message)
      setIsLoading(false)
      return
    }

    const catMap: Record<number, string> = {}
    for (const c of catRes.data ?? []) catMap[c.code as number] = c.name as string

    const subCatMap: Record<number, string> = {}
    for (const sc of subCatRes.data ?? []) subCatMap[sc.sub_code as number] = sc.name as string

    const supMap: Record<string, string> = {}
    for (const s of supRes.data ?? []) supMap[s.id as string] = s.name as string

    const mapped: ExpenseRow[] = (ledgerRes.data ?? []).map((r) => ({
      id: r.id as string,
      transaction_date: r.transaction_date as string,
      flow_type: r.flow_type as 'OpEx' | 'CapEx',
      category_code: r.category_code as number | null,
      sub_category_code: r.sub_category_code as number | null,
      supplier_id: r.supplier_id as string | null,
      details: (r.details ?? '') as string,
      amount_original: Number(r.amount_original ?? 0),
      currency: (r.currency ?? 'THB') as string,
      exchange_rate: Number(r.exchange_rate ?? 1),
      amount_thb: Number(r.amount_thb ?? 0),
      paid_by: (r.paid_by ?? '') as string,
      payment_method: (r.payment_method ?? 'cash') as string,
      status: (r.status ?? 'pending') as string,
      receipt_supplier_url: r.receipt_supplier_url as string | null,
      receipt_bank_url: r.receipt_bank_url as string | null,
      tax_invoice_url: r.tax_invoice_url as string | null,
      comments: (r.comments ?? null) as string | null,
      has_tax_invoice: (r.has_tax_invoice ?? false) as boolean,
      created_at: r.created_at as string,
      category_name: r.category_code != null ? (catMap[r.category_code as number] ?? null) : null,
      sub_category_name: r.sub_category_code != null ? (subCatMap[r.sub_category_code as number] ?? null) : null,
      supplier_name: r.supplier_id != null ? (supMap[r.supplier_id as string] ?? null) : null,
    }))

    setRows(mapped)
    setCategories((catRes.data ?? []).map((c) => ({ code: c.code as number, name: c.name as string })))
    setSubCategories(
      (subCatRes.data ?? []).map((sc) => ({
        sub_code: sc.sub_code as number,
        category_code: sc.category_code as number,
        name: sc.name as string,
      })),
    )
    setSuppliers((supRes.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string })))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Compute monthly summaries ──
  const monthlySummaries: MonthlySummary[] = (() => {
    const map = new Map<string, MonthlySummary>()
    for (const r of rows) {
      const month = r.transaction_date.slice(0, 7) // YYYY-MM
      if (!map.has(month)) map.set(month, { month, total_thb: 0, by_category: {} })
      const entry = map.get(month)!
      entry.total_thb += r.amount_thb
      const catName = r.category_name ?? 'Uncategorized'
      entry.by_category[catName] = (entry.by_category[catName] ?? 0) + r.amount_thb
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
  })()

  const grandTotal = rows.reduce((s, r) => s + r.amount_thb, 0)

  /** Update a single expense row. Returns error message or null on success. */
  const updateExpense = useCallback(
    async (id: string, payload: ExpenseUpdatePayload): Promise<string | null> => {
      const { error: updateErr } = await supabase
        .from('expense_ledger')
        .update(payload)
        .eq('id', id)

      if (updateErr) {
        console.error('[useExpenseLedger] update error', updateErr)
        return updateErr.message
      }

      await fetchData()
      return null
    },
    [fetchData],
  )

  return {
    rows,
    categories,
    subCategories,
    suppliers,
    monthlySummaries,
    grandTotal,
    isLoading,
    error,
    refetch: fetchData,
    updateExpense,
  }
}
