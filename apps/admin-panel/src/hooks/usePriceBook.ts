import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  PriceSummaryRow,
  PriceQuoteRow,
  QuoteInput,
  RpcResult,
  SourceFamily,
  ItemGroup,
} from '../types/priceBook'

const SUMMARY_COLS =
  'nomenclature_id, product_code, item_name, base_unit, current_cost, item_group, supplier_count, best_price, worst_price, avg_price, best_supplier, spread_pct'
const COMPARE_COLS =
  'nomenclature_id, catalog_id, supplier_id, supplier_name, last_seen_price, unit_cost, source_family, product_name, original_name, verified_at, updated_at'

function num(v: unknown): number | null {
  return v != null ? Number(v) : null
}

function normalizeSummary(r: Record<string, unknown>): PriceSummaryRow {
  return {
    nomenclature_id: r.nomenclature_id as string,
    product_code: r.product_code as string,
    item_name: r.item_name as string,
    base_unit: (r.base_unit as string | null) ?? null,
    current_cost: num(r.current_cost),
    item_group: (r.item_group as ItemGroup) ?? 'ingredient',
    supplier_count: Number(r.supplier_count ?? 0),
    best_price: num(r.best_price),
    worst_price: num(r.worst_price),
    avg_price: num(r.avg_price),
    best_supplier: (r.best_supplier as string | null) ?? null,
    spread_pct: num(r.spread_pct),
  }
}

function normalizeQuote(r: Record<string, unknown>): PriceQuoteRow {
  return {
    nomenclature_id: r.nomenclature_id as string,
    catalog_id: r.catalog_id as string,
    supplier_id: r.supplier_id as string,
    supplier_name: (r.supplier_name as string | null) ?? '—',
    last_seen_price: num(r.last_seen_price),
    unit_cost: num(r.unit_cost),
    source_family: (r.source_family as SourceFamily) ?? 'manual',
    product_name: (r.product_name as string | null) ?? null,
    original_name: (r.original_name as string | null) ?? null,
    verified_at: (r.verified_at as string | null) ?? null,
    updated_at: (r.updated_at as string | null) ?? null,
  }
}

export interface UsePriceBookResult {
  items: PriceSummaryRow[]
  supplierNames: string[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Lazily load every supplier's price for one item (on row expand). */
  fetchComparison: (nomenclatureId: string) => Promise<PriceQuoteRow[]>
  recordQuote: (input: QuoteInput) => Promise<RpcResult>
  setCanonicalCost: (catalogId: string) => Promise<RpcResult>
}

/** Price Book data layer over v_price_comparison_summary / v_price_comparison,
 * with the two quote RPCs. Realtime on supplier_catalog keeps the rollups
 * fresh after a quote is recorded or a scraper writes a new price. */
export function usePriceBook(): UsePriceBookResult {
  const [items, setItems] = useState<PriceSummaryRow[]>([])
  const [supplierNames, setSupplierNames] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [{ data, error: fetchError }, { data: sup }] = await Promise.all([
      supabase.from('v_price_comparison_summary').select(SUMMARY_COLS).order('item_name', { ascending: true }),
      supabase.from('suppliers').select('name').eq('is_deleted', false).order('name', { ascending: true }),
    ])
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setItems((data ?? []).map((r) => normalizeSummary(r as Record<string, unknown>)))
    }
    setSupplierNames((sup ?? []).map((s) => (s as { name: string }).name).filter(Boolean))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchSummary()
    const channel = supabase
      .channel('pricebook-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_catalog' }, () => {
        fetchSummary()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSummary])

  const fetchComparison = useCallback(async (nomenclatureId: string) => {
    const { data, error: cmpError } = await supabase
      .from('v_price_comparison')
      .select(COMPARE_COLS)
      .eq('nomenclature_id', nomenclatureId)
      .order('unit_cost', { ascending: true, nullsFirst: false })
    if (cmpError) return []
    return (data ?? []).map((r) => normalizeQuote(r as Record<string, unknown>))
  }, [])

  const recordQuote = useCallback(async (input: QuoteInput) => {
    const { data, error: rpcError } = await supabase.rpc('fn_record_supplier_quote', {
      p_nomenclature_id: input.nomenclature_id,
      p_unit_price: input.unit_price,
      p_supplier_name: input.supplier_name ?? null,
      p_supplier_id: input.supplier_id ?? null,
      p_note: input.note ?? null,
    })
    if (rpcError) return { ok: false, error: rpcError.message }
    const res = data as RpcResult
    if (res && res.ok === false) return res
    await fetchSummary()
    return { ok: true }
  }, [fetchSummary])

  const setCanonicalCost = useCallback(async (catalogId: string) => {
    const { data, error: rpcError } = await supabase.rpc('fn_set_canonical_cost', {
      p_catalog_id: catalogId,
    })
    if (rpcError) return { ok: false, error: rpcError.message }
    const res = data as RpcResult
    if (res && res.ok === false) return res
    await fetchSummary()
    return { ok: true }
  }, [fetchSummary])

  return {
    items,
    supplierNames,
    isLoading,
    error,
    refetch: fetchSummary,
    fetchComparison,
    recordQuote,
    setCanonicalCost,
  }
}
