import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  recordWaste,
  type WasteReason,
  type FinancialLiability,
  WASTE_REASON_LABELS,
  LIABILITY_LABELS,
} from '../lib/waste'

// Re-export so existing imports (`WasteLogForm`, etc.) keep working unchanged.
export {
  WASTE_REASON_LABELS,
  LIABILITY_LABELS,
}
export type { WasteReason, FinancialLiability }

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
      const result = await recordWaste(entry)
      if (result.ok) await fetchLogs()
      return result
    },
    [fetchLogs],
  )

  return { logs, isLoading, error, refetch: fetchLogs, createWaste }
}
