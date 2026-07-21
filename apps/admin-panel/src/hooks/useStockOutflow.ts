// ═══════════════════════════════════════════════════════════
// Hook: useStockOutflow
// "Where did the stock go" — the core stock-control surface.
//
// Unions the two outflow ledgers over a date window:
//   • stock_movements — sales (audit), comps, staff consumption (P1/P2)
//   • waste_logs      — expiry / spillage / quality / R&D write-offs
// Aggregates per nomenclature, bucketed by reason, valued at cost_per_unit
// (WAC). On-hand is read from v_inventory_by_nomenclature.
//
// NOTE on accuracy: sale-driven deduction is audit-only today
// (fn_deduct_order_bom logs stock_movements but does not decrement
// sku_balances). So "on-hand" reflects purchases − waste, NOT sales.
// The outflow figures here are the theoretical-consumption ledger; pair
// them with a periodic stocktake to read true shrinkage.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type OutflowBucket = 'sale' | 'comp' | 'staff' | 'waste' | 'other'

export const BUCKET_LABELS: Record<OutflowBucket, string> = {
  sale: 'Sales',
  comp: 'Comps / Giveaways',
  staff: 'Staff consumption',
  waste: 'Waste / Write-off',
  other: 'Other',
}

export interface OutflowRow {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  cost_per_unit: number | null
  /** Outflow quantity (base units) per bucket. */
  qty: Record<OutflowBucket, number>
  /** Estimated cost (qty × cost_per_unit) per bucket. */
  cost: Record<OutflowBucket, number>
  totalQty: number
  totalCost: number
  onHand: number
  lastCountedAt: string | null
}

export interface OutflowSummary {
  /** Total estimated cost per bucket across all products. */
  costByBucket: Record<OutflowBucket, number>
  totalCost: number
}

export interface UseStockOutflowResult {
  rows: OutflowRow[]
  summary: OutflowSummary
  sinceDays: number
  setSinceDays: (d: number) => void
  isLoading: boolean
  error: string | null
  refetch: () => void
}

function emptyBuckets(): Record<OutflowBucket, number> {
  return { sale: 0, comp: 0, staff: 0, waste: 0, other: 0 }
}

/** Classify a stock_movements.reason string into a display bucket. */
function classifyMovementReason(reason: string): OutflowBucket {
  const r = reason.toLowerCase()
  if (r.includes('sale') || r.includes('loyverse')) return 'sale'
  if (r.startsWith('comp') || r.includes('hospitality') || r.includes('owner_comp')) return 'comp'
  if (r.startsWith('staff') || r === 'staff_meal' || r === 'qa_tasting') return 'staff'
  if (r.includes('waste') || r.includes('expir')) return 'waste'
  return 'other'
}

export function useStockOutflow(initialSinceDays = 30): UseStockOutflowResult {
  const [rows, setRows] = useState<OutflowRow[]>([])
  const [summary, setSummary] = useState<OutflowSummary>({
    costByBucket: emptyBuckets(),
    totalCost: 0,
  })
  const [sinceDays, setSinceDays] = useState(initialSinceDays)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()

    const [movResult, wasteResult, nomResult, invResult] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('nomenclature_id, qty_delta, reason, created_at')
        .lt('qty_delta', 0) // outflows only
        .gte('created_at', since)
        .limit(20000),
      supabase
        .from('waste_logs')
        .select('nomenclature_id, quantity, reason, created_at')
        .gte('created_at', since)
        .limit(20000),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit, cost_per_unit'),
      supabase
        .from('v_inventory_by_nomenclature')
        .select('nomenclature_id, quantity, last_counted_at'),
    ])

    if (movResult.error) { setError(movResult.error.message); setIsLoading(false); return }
    if (wasteResult.error) { setError(wasteResult.error.message); setIsLoading(false); return }

    const nomMap = new Map((nomResult.data ?? []).map((n) => [n.id, n]))
    const invMap = new Map((invResult.data ?? []).map((v) => [v.nomenclature_id, v]))

    // Aggregate quantity per (nomenclature, bucket).
    const agg = new Map<string, Record<OutflowBucket, number>>()
    const ensure = (id: string) => {
      let b = agg.get(id)
      if (!b) { b = emptyBuckets(); agg.set(id, b) }
      return b
    }

    for (const m of movResult.data ?? []) {
      const bucket = classifyMovementReason(m.reason ?? '')
      ensure(m.nomenclature_id)[bucket] += Math.abs(Number(m.qty_delta ?? 0))
    }
    for (const w of wasteResult.data ?? []) {
      // waste_logs always count as the 'waste' bucket regardless of sub-reason
      ensure(w.nomenclature_id).waste += Math.abs(Number(w.quantity ?? 0))
    }

    const costByBucket = emptyBuckets()
    const outRows: OutflowRow[] = []

    for (const [nomId, qty] of agg.entries()) {
      const nom = nomMap.get(nomId)
      const cpu = nom?.cost_per_unit != null ? Number(nom.cost_per_unit) : null
      const inv = invMap.get(nomId)

      const cost = emptyBuckets()
      let totalQty = 0
      let totalCost = 0
      for (const bucket of Object.keys(qty) as OutflowBucket[]) {
        const q = qty[bucket]
        const c = cpu != null ? q * cpu : 0
        cost[bucket] = c
        costByBucket[bucket] += c
        totalQty += q
        totalCost += c
      }

      outRows.push({
        nomenclature_id: nomId,
        product_code: nom?.product_code ?? '',
        name: nom?.name ?? nomId.slice(0, 8),
        base_unit: nom?.base_unit ?? null,
        cost_per_unit: cpu,
        qty,
        cost,
        totalQty,
        totalCost,
        onHand: inv ? Number(inv.quantity ?? 0) : 0,
        lastCountedAt: inv?.last_counted_at ?? null,
      })
    }

    outRows.sort((a, b) => b.totalCost - a.totalCost || b.totalQty - a.totalQty)

    const totalCost = Object.values(costByBucket).reduce((s, v) => s + v, 0)

    setRows(outRows)
    setSummary({ costByBucket, totalCost })
    setIsLoading(false)
  }, [sinceDays])

  useEffect(() => { fetch() }, [fetch])

  return { rows, summary, sinceDays, setSinceDays, isLoading, error, refetch: fetch }
}
