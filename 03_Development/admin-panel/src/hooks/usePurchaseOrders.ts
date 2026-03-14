import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  PurchaseOrder,
  POLine,
  POStatus,
  CreatePOPayload,
  CreatePOResult,
} from '../types/procurement'

export interface UsePurchaseOrdersResult {
  orders: PurchaseOrder[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  statusFilter: POStatus | 'all'
  setStatusFilter: (s: POStatus | 'all') => void
  createPO: (payload: CreatePOPayload) => Promise<CreatePOResult>
  isCreating: boolean
  updateStatus: (poId: string, status: POStatus) => Promise<boolean>
  fetchLines: (poId: string) => Promise<POLine[]>
}

export function usePurchaseOrders(): UsePurchaseOrdersResult {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [isCreating, setIsCreating] = useState(false)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    let query = supabase
      .from('purchase_orders')
      .select('id, po_number, supplier_id, status, expected_date, notes, subtotal, grand_total, created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const [poRes, suppRes] = await Promise.all([
      query,
      supabase.from('suppliers').select('id, name'),
    ])

    if (poRes.error) {
      setError(poRes.error.message)
      setIsLoading(false)
      return
    }

    const suppMap = new Map(
      (suppRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
    )

    // Count lines per PO
    const poIds = (poRes.data ?? []).map((p: { id: string }) => p.id)
    let lineCounts = new Map<string, number>()
    if (poIds.length > 0) {
      const { data: lineData } = await supabase
        .from('po_lines')
        .select('po_id')
        .in('po_id', poIds)

      if (lineData) {
        const counts: Record<string, number> = {}
        for (const l of lineData) {
          counts[l.po_id] = (counts[l.po_id] || 0) + 1
        }
        lineCounts = new Map(Object.entries(counts))
      }
    }

    const merged: PurchaseOrder[] = (poRes.data ?? []).map((p) => ({
      id: p.id,
      po_number: p.po_number,
      supplier_id: p.supplier_id,
      supplier_name: suppMap.get(p.supplier_id) ?? 'Unknown',
      status: p.status as POStatus,
      expected_date: p.expected_date,
      notes: p.notes,
      subtotal: p.subtotal ? Number(p.subtotal) : null,
      grand_total: p.grand_total ? Number(p.grand_total) : null,
      created_at: p.created_at,
      line_count: lineCounts.get(p.id) ?? 0,
    }))

    setOrders(merged)
    setIsLoading(false)
  }, [statusFilter])

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('po-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchase_orders' },
        () => { fetchOrders() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  const createPO = useCallback(
    async (payload: CreatePOPayload): Promise<CreatePOResult> => {
      setIsCreating(true)
      const { data, error: rpcError } = await supabase.rpc('fn_create_purchase_order', {
        p_payload: payload,
      })
      setIsCreating(false)

      if (rpcError) return { ok: false, error: rpcError.message }
      return data as CreatePOResult
    },
    [],
  )

  const updateStatus = useCallback(
    async (poId: string, status: POStatus): Promise<boolean> => {
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', poId)

      if (updateError) return false
      fetchOrders()
      return true
    },
    [fetchOrders],
  )

  const fetchLines = useCallback(async (poId: string): Promise<POLine[]> => {
    const [lineRes, nomRes] = await Promise.all([
      supabase
        .from('po_lines')
        .select('id, po_id, nomenclature_id, sku_id, qty_ordered, unit, unit_price_expected, total_expected, sort_order, notes')
        .eq('po_id', poId)
        .order('sort_order'),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit'),
    ])

    if (lineRes.error) return []

    const nomMap = new Map(
      (nomRes.data ?? []).map((n: { id: string; product_code: string; name: string; base_unit: string | null }) => [
        n.id,
        { product_code: n.product_code, name: n.name, base_unit: n.base_unit ?? 'pcs' },
      ]),
    )

    return (lineRes.data ?? []).map((l) => {
      const nom = nomMap.get(l.nomenclature_id)
      return {
        ...l,
        product_name: nom?.name ?? 'Unknown',
        product_code: nom?.product_code ?? '',
        base_unit: nom?.base_unit ?? 'pcs',
        qty_ordered: Number(l.qty_ordered),
        unit_price_expected: l.unit_price_expected ? Number(l.unit_price_expected) : null,
        total_expected: l.total_expected ? Number(l.total_expected) : null,
      } as POLine
    })
  }, [])

  return {
    orders, isLoading, error, refetch: fetchOrders,
    statusFilter, setStatusFilter,
    createPO, isCreating,
    updateStatus, fetchLines,
  }
}
