// Stock & Reorder (Procurement Phase 3) — types
// Backed by public.v_stock_status (migration 320)

export type StockStatusValue = 'out' | 'low' | 'ok' | 'untracked'

/** One row of v_stock_status — a tracked ingredient/prep with on-hand vs par,
 * batch/expiry rollup, and the audit-only decrement-gap columns. */
export interface StockStatusRow {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  storage_location: string | null
  shelf_life_days: number | null
  cost_per_unit: number | null
  default_supplier_id: string | null
  min_stock: number | null
  par_stock: number | null
  reorder_qty: number | null
  on_hand: number
  last_counted_at: string | null
  /** Σ consumption booked since the last count (audit-only ledger). */
  consumed_since_count: number
  /** on_hand − consumed_since_count → "Est. now" (the visible drift). */
  theoretical_on_hand: number
  live_batches: number
  next_expiry: string | null
  expiring_soon: number
  expired: number
  suggested_qty: number | null
  stock_status: StockStatusValue
}

/** Patch shape for inline par editing (par columns only — never cost).
 * A `type` (not `interface`) so it carries an implicit index signature and
 * stays assignable to useInlineUpdate's `UpdatePatch` constraint. */
export type StockParPatch = {
  min_stock?: number | null
  par_stock?: number | null
  reorder_qty?: number | null
  default_supplier_id?: string | null
}

export interface StockMutationResult {
  ok: boolean
  error?: string
}

export interface StatusMeta {
  label: string
  /** Tailwind classes for the status badge. */
  badgeCls: string
  /** Sort severity — lower sorts first (out before low before ok). */
  rank: number
}

export const STOCK_STATUS_META: Record<StockStatusValue, StatusMeta> = {
  out: { label: 'Out', badgeCls: 'bg-brick-soft/15 text-brick-bright', rank: 0 },
  low: { label: 'Low', badgeCls: 'bg-amber-watch/15 text-amber-watch', rank: 1 },
  ok: { label: 'OK', badgeCls: 'bg-forest-soft/15 text-mint-200', rank: 2 },
  untracked: { label: 'Untracked', badgeCls: 'bg-[var(--s-3)] text-cream/45', rank: 3 },
}

/** Sort comparator: by status severity, then name. */
export function compareStockRows(a: StockStatusRow, b: StockStatusRow): number {
  const ra = STOCK_STATUS_META[a.stock_status].rank
  const rb = STOCK_STATUS_META[b.stock_status].rank
  if (ra !== rb) return ra - rb
  return a.name.localeCompare(b.name)
}

/** True when par is set below min — a soft data-entry warning (no DB CHECK). */
export function isParBelowMin(row: Pick<StockStatusRow, 'min_stock' | 'par_stock'>): boolean {
  return row.min_stock != null && row.par_stock != null && row.par_stock < row.min_stock
}
