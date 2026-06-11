import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StockStatus } from '../types/stockSheet'

export type StockRequestStatus = 'open' | 'converted' | 'archived'

export interface StockRequestSummary {
  id: string
  submitted_at: string
  note: string | null
  status: StockRequestStatus
  line_count: number
}

export interface StockRequestLine {
  id: string
  nomenclature_id: string
  status: StockStatus
  order_qty: number | null
  note: string | null
  product_name: string
  product_code: string
  base_unit: string | null
}

export interface UseStockRequestsResult {
  requests: StockRequestSummary[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  fetchLines: (requestId: string) => Promise<StockRequestLine[]>
  updateStatus: (id: string, status: StockRequestStatus) => Promise<boolean>
}

/** Owner-side view of staff stock-sheet submissions (stock_requests + lines). */
export function useStockRequests(): UseStockRequestsResult {
  const [requests, setRequests] = useState<StockRequestSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const { data, error: qErr } = await supabase
      .from('stock_requests')
      .select('id, submitted_at, note, status')
      .order('submitted_at', { ascending: false })
      .limit(100)

    if (qErr) {
      setError(qErr.message)
      setRequests([])
      setIsLoading(false)
      return
    }

    const ids = (data ?? []).map((r: { id: string }) => r.id)
    const counts = new Map<string, number>()
    if (ids.length > 0) {
      const { data: lineData } = await supabase
        .from('stock_request_lines')
        .select('request_id')
        .in('request_id', ids)
      for (const l of lineData ?? []) {
        counts.set(l.request_id, (counts.get(l.request_id) ?? 0) + 1)
      }
    }

    setRequests(
      (data ?? []).map((r) => ({
        id: r.id,
        submitted_at: r.submitted_at,
        note: r.note,
        status: r.status as StockRequestStatus,
        line_count: counts.get(r.id) ?? 0,
      })),
    )
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchRequests()

    const channel = supabase
      .channel('stock-requests-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_requests' },
        () => { fetchRequests() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchRequests])

  const fetchLines = useCallback(async (requestId: string): Promise<StockRequestLine[]> => {
    const [lineRes, nomRes] = await Promise.all([
      supabase
        .from('stock_request_lines')
        .select('id, nomenclature_id, status, order_qty, note')
        .eq('request_id', requestId),
      supabase.from('nomenclature').select('id, product_code, name, base_unit'),
    ])

    if (lineRes.error) return []

    const nomMap = new Map(
      (nomRes.data ?? []).map((n: { id: string; product_code: string; name: string; base_unit: string | null }) => [
        n.id,
        { product_code: n.product_code, name: n.name, base_unit: n.base_unit },
      ]),
    )

    return (lineRes.data ?? []).map((l) => {
      const nom = nomMap.get(l.nomenclature_id)
      return {
        id: l.id,
        nomenclature_id: l.nomenclature_id,
        status: l.status as StockStatus,
        order_qty: l.order_qty !== null ? Number(l.order_qty) : null,
        note: l.note,
        product_name: nom?.name ?? 'Unknown',
        product_code: nom?.product_code ?? '',
        base_unit: nom?.base_unit ?? null,
      }
    })
  }, [])

  const updateStatus = useCallback(
    async (id: string, status: StockRequestStatus): Promise<boolean> => {
      const { error: upErr } = await supabase
        .from('stock_requests')
        .update({ status })
        .eq('id', id)
      if (upErr) return false
      fetchRequests()
      return true
    },
    [fetchRequests],
  )

  return { requests, isLoading, error, refetch: fetchRequests, fetchLines, updateStatus }
}
