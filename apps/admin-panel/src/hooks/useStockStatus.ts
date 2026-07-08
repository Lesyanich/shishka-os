import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'
import {
  compareStockRows,
  type StockStatusRow,
  type StockParPatch,
  type StockMutationResult,
} from '../types/stockStatus'

const SELECT_COLS =
  'nomenclature_id, product_code, name, base_unit, storage_location, shelf_life_days, ' +
  'cost_per_unit, default_supplier_id, min_stock, par_stock, reorder_qty, on_hand, ' +
  'last_counted_at, consumed_since_count, theoretical_on_hand, live_batches, next_expiry, ' +
  'expiring_soon, expired, suggested_qty, stock_status'

interface RawRow {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  storage_location: string | null
  shelf_life_days: number | string | null
  cost_per_unit: number | string | null
  default_supplier_id: string | null
  min_stock: number | string | null
  par_stock: number | string | null
  reorder_qty: number | string | null
  on_hand: number | string | null
  last_counted_at: string | null
  consumed_since_count: number | string | null
  theoretical_on_hand: number | string | null
  live_batches: number | string | null
  next_expiry: string | null
  expiring_soon: number | string | null
  expired: number | string | null
  suggested_qty: number | string | null
  stock_status: StockStatusRow['stock_status']
}

const num = (v: number | string | null): number => (v != null ? Number(v) : 0)
const numOrNull = (v: number | string | null): number | null => (v != null ? Number(v) : null)

/** Pure: coerce numeric strings (Supabase returns numeric as string). Exported
 * for testing. */
export function normalizeStockRow(row: RawRow): StockStatusRow {
  return {
    nomenclature_id: row.nomenclature_id,
    product_code: row.product_code,
    name: row.name,
    base_unit: row.base_unit ?? null,
    storage_location: row.storage_location ?? null,
    shelf_life_days: numOrNull(row.shelf_life_days),
    cost_per_unit: numOrNull(row.cost_per_unit),
    default_supplier_id: row.default_supplier_id ?? null,
    min_stock: numOrNull(row.min_stock),
    par_stock: numOrNull(row.par_stock),
    reorder_qty: numOrNull(row.reorder_qty),
    on_hand: num(row.on_hand),
    last_counted_at: row.last_counted_at ?? null,
    consumed_since_count: num(row.consumed_since_count),
    theoretical_on_hand: num(row.theoretical_on_hand),
    live_batches: num(row.live_batches),
    next_expiry: row.next_expiry ?? null,
    expiring_soon: num(row.expiring_soon),
    expired: num(row.expired),
    suggested_qty: numOrNull(row.suggested_qty),
    stock_status: row.stock_status,
  }
}

export interface UseStockStatusResult {
  rows: StockStatusRow[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** Inline par edit — writes par columns directly (NOT cost, which is
   * trigger-managed). */
  updatePar: (id: string, patch: StockParPatch) => Promise<StockMutationResult>
  lowCount: number
  expiringCount: number
  untrackedCount: number
}

export function useStockStatus(): UseStockStatusResult {
  const [rows, setRows] = useState<StockStatusRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRows = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('v_stock_status')
      .select(SELECT_COLS)

    if (fetchError) {
      setError(fetchError.message)
      setIsLoading(false)
      return
    }
    // v_stock_status isn't in the generated DB types, so supabase-js widens the
    // row to an error-ish type — cast through unknown.
    setRows((data ?? []).map((r) => normalizeStockRow(r as unknown as RawRow)).sort(compareStockRows))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  useCoalescedRealtimeRefetch(
    'stock-status-live',
    [{ table: 'sku_balances' }, { table: 'inventory_batches' }],
    () => { fetchRows({ silent: true }) },
  )

  const updatePar = useCallback(
    async (id: string, patch: StockParPatch): Promise<StockMutationResult> => {
      // No local optimistic write here — the component layer drives instant
      // feedback via useOptimistic; we refetch so derived status/suggested_qty
      // recompute from the view.
      const { error: updateError } = await supabase
        .from('nomenclature')
        .update(patch)
        .eq('id', id)
      if (updateError) {
        await fetchRows({ silent: true })
        return { ok: false, error: updateError.message }
      }
      await fetchRows({ silent: true })
      return { ok: true }
    },
    [fetchRows],
  )

  const { lowCount, expiringCount, untrackedCount } = useMemo(() => {
    let low = 0
    let expiring = 0
    let untracked = 0
    for (const r of rows) {
      if (r.stock_status === 'low' || r.stock_status === 'out') low += 1
      if (r.expiring_soon > 0 || r.expired > 0) expiring += 1
      if (r.stock_status === 'untracked') untracked += 1
    }
    return { lowCount: low, expiringCount: expiring, untrackedCount: untracked }
  }, [rows])

  return { rows, isLoading, error, refetch: fetchRows, updatePar, lowCount, expiringCount, untrackedCount }
}
