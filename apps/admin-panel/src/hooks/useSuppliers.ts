import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'

/** Weekday codes stored in suppliers.delivery_days (text[]). */
export type WeekdayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export const WEEKDAYS: ReadonlyArray<{ code: WeekdayCode; label: string }> = [
  { code: 'mon', label: 'Mon' },
  { code: 'tue', label: 'Tue' },
  { code: 'wed', label: 'Wed' },
  { code: 'thu', label: 'Thu' },
  { code: 'fri', label: 'Fri' },
  { code: 'sat', label: 'Sat' },
  { code: 'sun', label: 'Sun' },
]

const WEEKDAY_ORDER: Record<WeekdayCode, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  /** Legacy freetext blob — read-only in the UI, kept for OCR back-compat. */
  contact_info: string | null
  delivery_days: WeekdayCode[]
  delivery_window: string | null
  lead_time_days: number | null
  min_order_thb: number | null
  payment_terms: string | null
  notes: string | null
}

// `type` (not `interface`) so it carries an implicit index signature and
// satisfies useInlineUpdate's `P extends UpdatePatch` constraint.
export type SupplierPatch = {
  name?: string
  contact_person?: string | null
  phone?: string | null
  delivery_days?: WeekdayCode[]
  delivery_window?: string | null
  lead_time_days?: number | null
  min_order_thb?: number | null
  payment_terms?: string | null
  notes?: string | null
}

export interface MutationResult {
  ok: boolean
  error?: string
}

/** A row from supplier_catalog, lazily fetched for the "sells N products" panel. */
export interface SupplierProduct {
  id: string
  nomenclature_id: string | null
  product_name: string | null
  original_name: string | null
  last_seen_price: number | null
  base_unit: string | null
  source: string | null
}

const SELECT_COLS =
  'id, name, contact_person, phone, contact_info, delivery_days, delivery_window, lead_time_days, min_order_thb, payment_terms, notes'

interface RawSupplierRow {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  contact_info: string | null
  delivery_days: string[] | null
  delivery_window: string | null
  lead_time_days: number | string | null
  min_order_thb: number | string | null
  payment_terms: string | null
  notes: string | null
}

/** Pure: shape a raw Supabase row into a typed Supplier (numbers parsed,
 * weekday array sorted Mon→Sun). Exported for unit testing. */
export function normalizeSupplier(row: RawSupplierRow): Supplier {
  const days = (Array.isArray(row.delivery_days) ? row.delivery_days : [])
    .filter((d): d is WeekdayCode => d in WEEKDAY_ORDER)
    .sort((a, b) => WEEKDAY_ORDER[a] - WEEKDAY_ORDER[b])
  return {
    id: row.id,
    name: row.name,
    contact_person: row.contact_person ?? null,
    phone: row.phone ?? null,
    contact_info: row.contact_info ?? null,
    delivery_days: days,
    delivery_window: row.delivery_window ?? null,
    lead_time_days: row.lead_time_days != null ? Number(row.lead_time_days) : null,
    min_order_thb: row.min_order_thb != null ? Number(row.min_order_thb) : null,
    payment_terms: row.payment_terms ?? null,
    notes: row.notes ?? null,
  }
}

/** Pure: toggle a weekday in/out of a delivery-days array, kept sorted
 * Mon→Sun. Exported for unit testing. */
export function toggleDeliveryDay(days: WeekdayCode[], code: WeekdayCode): WeekdayCode[] {
  const has = days.includes(code)
  const next = has ? days.filter((d) => d !== code) : [...days, code]
  return next.sort((a, b) => WEEKDAY_ORDER[a] - WEEKDAY_ORDER[b])
}

/** Pure: trim string fields and coerce empty strings to null before sending a
 * patch to Supabase, so blanked fields clear rather than store "". Exported
 * for unit testing. */
export function shapeSupplierPatch(patch: SupplierPatch): SupplierPatch {
  const out: SupplierPatch = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'delivery_days') {
      out.delivery_days = (value as WeekdayCode[]) ?? []
    } else if (typeof value === 'string') {
      const trimmed = value.trim()
      ;(out as Record<string, unknown>)[key] = trimmed === '' ? null : trimmed
    } else {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

export interface UseSuppliersResult {
  suppliers: Supplier[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  createSupplier: (name: string) => Promise<MutationResult & { id?: string }>
  updateSupplier: (id: string, patch: SupplierPatch) => Promise<MutationResult>
  removeSupplier: (id: string) => Promise<MutationResult>
  fetchSupplierProducts: (supplierId: string) => Promise<SupplierProduct[]>
}

/** Suppliers directory data layer. Follows the house hook pattern: state +
 * useCallback fetch + realtime channel + mutators returning {ok,error} that
 * compose with useInlineUpdate / useOptimistic in the component. */
export function useSuppliers(): UseSuppliersResult {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSuppliers = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('suppliers')
      .select(SELECT_COLS)
      .eq('is_deleted', false)
      .order('name', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setSuppliers((data ?? []).map((r) => normalizeSupplier(r as RawSupplierRow)))
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  useCoalescedRealtimeRefetch('suppliers-live', [{ table: 'suppliers' }],
    () => { fetchSuppliers({ silent: true }) })

  const createSupplier = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Supplier name is required' }
    const { data, error: insertError } = await supabase
      .from('suppliers')
      .insert({ name: trimmed })
      .select('id')
      .single()
    if (insertError) return { ok: false, error: insertError.message }
    // Insert returns only the id; the joined/normalized row comes from a SILENT
    // refetch (no spinner). Realtime would also catch it — this makes it instant.
    await fetchSuppliers({ silent: true })
    return { ok: true, id: data?.id as string | undefined }
  }, [fetchSuppliers])

  const updateSupplier = useCallback(async (id: string, patch: SupplierPatch) => {
    const shaped = shapeSupplierPatch(patch)
    if (shaped.name !== undefined && (shaped.name === null || shaped.name === '')) {
      return { ok: false, error: 'Supplier name is required' }
    }
    const { error: updateError } = await supabase
      .from('suppliers')
      .update(shaped)
      .eq('id', id)
    if (updateError) return { ok: false, error: updateError.message }
    return { ok: true }
  }, [])

  const removeSupplier = useCallback(async (id: string) => {
    const { error: delError } = await supabase
      .from('suppliers')
      .update({ is_deleted: true })
      .eq('id', id)
    if (delError) return { ok: false, error: delError.message }
    // Optimistic removal — soft-deleted rows drop out of the is_deleted=false view.
    setSuppliers((prev) => prev.filter((s) => s.id !== id))
    return { ok: true }
  }, [])

  const fetchSupplierProducts = useCallback(async (supplierId: string) => {
    const { data, error: prodError } = await supabase
      .from('supplier_catalog')
      .select('id, nomenclature_id, product_name, original_name, last_seen_price, base_unit, source')
      .eq('supplier_id', supplierId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (prodError) return []
    return (data ?? []).map((r) => ({
      id: r.id as string,
      nomenclature_id: (r.nomenclature_id as string | null) ?? null,
      product_name: (r.product_name as string | null) ?? null,
      original_name: (r.original_name as string | null) ?? null,
      last_seen_price: r.last_seen_price != null ? Number(r.last_seen_price) : null,
      base_unit: (r.base_unit as string | null) ?? null,
      source: (r.source as string | null) ?? null,
    }))
  }, [])

  return {
    suppliers,
    isLoading,
    error,
    refetch: fetchSuppliers,
    createSupplier,
    updateSupplier,
    removeSupplier,
    fetchSupplierProducts,
  }
}
