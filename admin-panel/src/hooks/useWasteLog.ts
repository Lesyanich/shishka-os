import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type WasteReason = 'expiration' | 'spillage_damage' | 'quality_reject' | 'rd_testing'
export type FinancialLiability = 'cafe' | 'employee' | 'supplier'

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  expiration: 'Expiration',
  spillage_damage: 'Spillage / Damage',
  quality_reject: 'Quality Reject',
  rd_testing: 'R&D Testing',
}

export const LIABILITY_LABELS: Record<FinancialLiability, string> = {
  cafe: 'Cafe (business expense)',
  employee: 'Employee',
  supplier: 'Supplier',
}

export interface WasteLogEntry {
  id: string
  nomenclature_id: string
  product_code?: string
  name?: string
  quantity: number
  reason: WasteReason
  financial_liability: FinancialLiability
  comment: string | null
  created_at: string
}

export interface UseWasteLogResult {
  logs: WasteLogEntry[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  createWaste: (entry: {
    nomenclature_id: string
    quantity: number
    reason: WasteReason
    financial_liability: FinancialLiability
    comment: string | null
  }) => Promise<{ ok: boolean; error?: string }>
}

export function useWasteLog(): UseWasteLogResult {
  const [logs, setLogs] = useState<WasteLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Two queries: waste_logs + nomenclature, joined in JS
    const [wasteResult, nomResult] = await Promise.all([
      supabase
        .from('waste_logs')
        .select('id, nomenclature_id, quantity, reason, financial_liability, comment, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('nomenclature')
        .select('id, product_code, name'),
    ])

    if (wasteResult.error) {
      setError(wasteResult.error.message)
      setIsLoading(false)
      return
    }

    const nomMap = new Map(
      (nomResult.data ?? []).map((n) => [n.id, n]),
    )

    const merged: WasteLogEntry[] = (wasteResult.data ?? []).map((w) => {
      const nom = nomMap.get(w.nomenclature_id)
      return {
        ...w,
        product_code: nom?.product_code,
        name: nom?.name,
      } as WasteLogEntry
    })

    setLogs(merged)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const createWaste = useCallback(
    async (entry: {
      nomenclature_id: string
      quantity: number
      reason: WasteReason
      financial_liability: FinancialLiability
      comment: string | null
    }): Promise<{ ok: boolean; error?: string }> => {
      const { error: insertError } = await supabase
        .from('waste_logs')
        .insert(entry)

      if (insertError) {
        return { ok: false, error: insertError.message }
      }

      // Phase 10: Deduct from sku_balances (FIFO — oldest received first)
      let remaining = entry.quantity
      const { data: skuBalances } = await supabase
        .from('sku_balances')
        .select('sku_id, quantity')
        .eq('nomenclature_id', entry.nomenclature_id)
        .order('last_received_at', { ascending: true, nullsFirst: true })

      for (const bal of skuBalances ?? []) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, Number(bal.quantity))
        const newQty = Math.max(0, Number(bal.quantity) - deduct)
        await supabase
          .from('sku_balances')
          .update({ quantity: newQty })
          .eq('sku_id', bal.sku_id)
        remaining -= deduct
      }

      await fetchLogs()
      return { ok: true }
    },
    [fetchLogs],
  )

  return { logs, isLoading, error, refetch: fetchLogs, createWaste }
}
