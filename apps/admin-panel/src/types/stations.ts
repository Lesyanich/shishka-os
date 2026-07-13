// Station-based stock v1 (S1) — shared types for stations, the auto-derived
// per-station checklist (v_station_checklist, mig 351) and stocktake session
// documents (stocktake_sessions, mig 349).

export type StationFloor = 'L1' | 'L2' | 'general'

export interface Station {
  id: string
  code: string
  name: string
  name_th: string | null
  floor: StationFloor
  location_id: string
  is_active: boolean
  sort_order: number
}

export type ChecklistItemKind = 'food' | 'packaging'
export type CountClass = 'A' | 'B' | 'C'

export interface StationChecklistRow {
  station_id: string
  station_code: string
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  type: string
  item_kind: ChecklistItemKind
  cost_per_unit: number | null
  count_class: CountClass | null
  batch_on_hand: number
  next_expiry: string | null
  expiring_soon: number
  expired: number
  last_count: number | null
  last_count_at: string | null
  min_stock: number | null
  par_stock: number | null
  is_due_today: boolean
}

export type StocktakeSessionStatus = 'draft' | 'submitted' | 'applied' | 'cancelled'
export type StocktakeScope = 'food' | 'packaging' | 'full'

export interface StocktakeSession {
  id: string
  doc_number: string
  station_id: string
  status: StocktakeSessionStatus
  is_baseline: boolean
  scope: StocktakeScope
  counted_by: string | null
  opened_at: string
  submitted_at: string | null
  applied_at: string | null
  applied_by: string | null
  entries_count: number | null
  variance_value_thb: number | null
  notes: string | null
}

/** Supabase returns numeric as string — coerce all numeric fields once. */
const num = (v: number | string | null | undefined): number =>
  v != null ? Number(v) : 0
const numOrNull = (v: number | string | null | undefined): number | null =>
  v != null ? Number(v) : null

// Raw row shapes (numerics widened to string per PostgREST behavior)
export interface RawChecklistRow {
  station_id: string
  station_code: string
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string | null
  type: string
  item_kind: string
  cost_per_unit: number | string | null
  count_class: string | null
  batch_on_hand: number | string | null
  next_expiry: string | null
  expiring_soon: number | string | null
  expired: number | string | null
  last_count: number | string | null
  last_count_at: string | null
  min_stock: number | string | null
  par_stock: number | string | null
  is_due_today: boolean | null
}

export function normalizeChecklistRow(r: RawChecklistRow): StationChecklistRow {
  return {
    station_id: r.station_id,
    station_code: r.station_code,
    nomenclature_id: r.nomenclature_id,
    product_code: r.product_code,
    name: r.name,
    base_unit: r.base_unit ?? null,
    type: r.type,
    item_kind: r.item_kind === 'packaging' ? 'packaging' : 'food',
    cost_per_unit: numOrNull(r.cost_per_unit),
    count_class: (r.count_class === 'A' || r.count_class === 'B' || r.count_class === 'C'
      ? r.count_class
      : null) as CountClass | null,
    batch_on_hand: num(r.batch_on_hand),
    next_expiry: r.next_expiry ?? null,
    expiring_soon: num(r.expiring_soon),
    expired: num(r.expired),
    last_count: numOrNull(r.last_count),
    last_count_at: r.last_count_at ?? null,
    min_stock: numOrNull(r.min_stock),
    par_stock: numOrNull(r.par_stock),
    is_due_today: r.is_due_today ?? true,
  }
}

/** Sort: due first, then class A→B→C→null, then name. */
export function compareChecklistRows(a: StationChecklistRow, b: StationChecklistRow): number {
  if (a.is_due_today !== b.is_due_today) return a.is_due_today ? -1 : 1
  const cls = (c: CountClass | null) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3)
  if (cls(a.count_class) !== cls(b.count_class)) return cls(a.count_class) - cls(b.count_class)
  return a.name.localeCompare(b.name)
}

export const COUNT_CLASS_META: Record<CountClass, { label: string; badgeCls: string }> = {
  A: { label: 'A · daily', badgeCls: 'bg-brick-soft/20 text-brick-bright' },
  B: { label: 'B · weekly', badgeCls: 'bg-amber-watch/15 text-amber-watch' },
  C: { label: 'C · monthly', badgeCls: 'bg-[var(--s-2)] text-cream/50' },
}

export type CountStatus = 'out' | 'low' | 'in' | 'over' | 'untracked'

/** Where a counted (or on-hand) value sits vs Min/Par. Pure — tested. */
export function countStatus(
  value: number | null,
  min: number | null,
  par: number | null,
): CountStatus {
  if (min == null && par == null) return 'untracked'
  if (value == null || value <= 0) return 'out'
  if (min != null && value <= min) return 'low'
  if (par != null && value > par) return 'over'
  return 'in'
}

/** Zone-bar geometry: fill % (0–100, capped) of the entered value against a
 * Par-scaled track, plus the status colouring. Track spans 0→Par (fallback to
 * Min×2 when Par is unset). */
export function zoneBarFill(
  value: number | null,
  min: number | null,
  par: number | null,
): { pct: number; minPct: number; status: CountStatus } {
  const status = countStatus(value, min, par)
  const scale = par ?? (min != null ? min * 2 : null)
  if (scale == null || scale <= 0) return { pct: 0, minPct: 0, status }
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / scale) * 100))
  const minPct = min != null ? Math.max(0, Math.min(100, (min / scale) * 100)) : 0
  return { pct, minPct, status }
}

export const COUNT_STATUS_META: Record<CountStatus, { label: string; text: string; fill: string }> = {
  out: { label: 'Out', text: 'text-brick-bright', fill: 'var(--color-brick, #b62a23)' },
  low: { label: 'Low', text: 'text-amber-watch', fill: 'var(--color-amber-watch, #d9a441)' },
  in: { label: 'In', text: 'text-forest-soft', fill: 'var(--color-forest-soft, #4a7a3a)' },
  over: { label: 'Over', text: 'text-forest-soft', fill: 'var(--color-forest-soft, #4a7a3a)' },
  untracked: { label: '—', text: 'text-cream/40', fill: 'var(--s-3)' },
}

export const SESSION_STATUS_META: Record<StocktakeSessionStatus, { label: string; badgeCls: string }> = {
  draft: { label: 'Draft', badgeCls: 'bg-[var(--s-2)] text-cream/60' },
  submitted: { label: 'Submitted', badgeCls: 'bg-amber-watch/15 text-amber-watch' },
  applied: { label: 'Applied', badgeCls: 'bg-forest-soft/20 text-forest-soft' },
  cancelled: { label: 'Cancelled', badgeCls: 'bg-[var(--s-2)] text-cream/35' },
}
