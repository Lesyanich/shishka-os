import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ════════════════════════════════════════════════════════════════
   useSpokeData — Lazy-fetch Hub→Spoke line items by expense_id
   Queries: purchase_logs, capex_transactions, opex_items
   Cache: Module-scope Map — survives component unmount/remount
   ════════════════════════════════════════════════════════════════ */

/* ─── Types ─── */

export interface PurchaseLogRow {
  id: string
  nomenclature_id: string
  supplier_id: string
  quantity: number
  price_per_unit: number
  total_price: number
  invoice_date: string
  notes: string | null
  nomenclature_name: string | null
  nomenclature_code: string | null
}

export interface CapexTransactionRow {
  id: string
  transaction_id: string
  amount_thb: number
  transaction_date: string
  transaction_type: string
  category_code: number | null
  vendor: string | null
  details: string | null
}

export interface OpexItemRow {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
}

export interface SpokeData {
  purchaseLogs: PurchaseLogRow[]
  capexTransactions: CapexTransactionRow[]
  opexItems: OpexItemRow[]
}

/* ─── Module-scope cache (survives unmount/remount cycles) ─── */

const spokeCache = new Map<string, SpokeData>()

/* ─── Hook ─── */

export function useSpokeData(expenseId: string | null): {
  data: SpokeData | null
  isLoading: boolean
  error: string | null
} {
  const [data, setData] = useState<SpokeData | null>(
    expenseId ? spokeCache.get(expenseId) ?? null : null,
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!expenseId) {
      setData(null)
      setIsLoading(false)
      setError(null)
      return
    }

    // Cache hit — return instantly
    const cached = spokeCache.get(expenseId)
    if (cached) {
      setData(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const eid = expenseId // narrowed to string after the null guard above

    async function fetchSpoke() {
      setIsLoading(true)
      setError(null)

      try {
        // 3 parallel queries (CLAUDE.md Rule #3: separate queries + JS join)
        const [plRes, ctRes, oiRes] = await Promise.all([
          supabase
            .from('purchase_logs')
            .select('id, nomenclature_id, supplier_id, quantity, price_per_unit, total_price, invoice_date, notes')
            .eq('expense_id', eid),
          supabase
            .from('capex_transactions')
            .select('id, transaction_id, amount_thb, transaction_date, transaction_type, category_code, vendor, details')
            .eq('expense_id', eid),
          supabase
            .from('opex_items')
            .select('id, description, quantity, unit, unit_price, total_price')
            .eq('expense_id', eid),
        ])

        if (plRes.error) throw plRes.error
        if (ctRes.error) throw ctRes.error
        if (oiRes.error) throw oiRes.error

        // 4th query: nomenclature names for purchase_logs (JS join)
        const nomIds = (plRes.data ?? [])
          .map((r) => r.nomenclature_id as string)
          .filter(Boolean)

        const nomMap: Record<string, { name: string; product_code: string }> = {}
        if (nomIds.length > 0) {
          const { data: noms } = await supabase
            .from('nomenclature')
            .select('id, name, product_code')
            .in('id', nomIds)
          for (const n of noms ?? []) {
            nomMap[n.id as string] = {
              name: n.name as string,
              product_code: (n.product_code ?? '') as string,
            }
          }
        }

        const result: SpokeData = {
          purchaseLogs: (plRes.data ?? []).map((r) => ({
            id: r.id as string,
            nomenclature_id: r.nomenclature_id as string,
            supplier_id: r.supplier_id as string,
            quantity: Number(r.quantity ?? 0),
            price_per_unit: Number(r.price_per_unit ?? 0),
            total_price: Number(r.total_price ?? 0),
            invoice_date: r.invoice_date as string,
            notes: (r.notes ?? null) as string | null,
            nomenclature_name: nomMap[r.nomenclature_id as string]?.name ?? null,
            nomenclature_code: nomMap[r.nomenclature_id as string]?.product_code ?? null,
          })),
          capexTransactions: (ctRes.data ?? []).map((r) => ({
            id: r.id as string,
            transaction_id: (r.transaction_id ?? '') as string,
            amount_thb: Number(r.amount_thb ?? 0),
            transaction_date: r.transaction_date as string,
            transaction_type: (r.transaction_type ?? '') as string,
            category_code: r.category_code as number | null,
            vendor: (r.vendor ?? null) as string | null,
            details: (r.details ?? null) as string | null,
          })),
          opexItems: (oiRes.data ?? []).map((r) => ({
            id: r.id as string,
            description: (r.description ?? '') as string,
            quantity: Number(r.quantity ?? 0),
            unit: (r.unit ?? 'pcs') as string,
            unit_price: Number(r.unit_price ?? 0),
            total_price: Number(r.total_price ?? 0),
          })),
        }

        // Store in module-scope cache
        spokeCache.set(eid, result)

        if (!cancelled) {
          setData(result)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('[useSpokeData] fetch error', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load line items')
          setIsLoading(false)
        }
      }
    }

    fetchSpoke()
    return () => { cancelled = true }
  }, [expenseId])

  return { data, isLoading, error }
}
