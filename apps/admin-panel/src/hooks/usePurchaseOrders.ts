import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCoalescedRealtimeRefetch } from './useCoalescedRealtimeRefetch'
import type {
  PurchaseOrder,
  POLine,
  POStatus,
  POStage,
  CreatePOPayload,
  CreatePOResult,
  UpdatePOPatch,
  UpdatePOResult,
  Station,
  LinkedReceipt,
  ParsedReceiptItem,
  ReceivedLineSummary,
} from '../types/procurement'
import { runOcrParse, getStoredOcrModel, type OcrParseResult } from '../lib/ocrParse'

/* ───────────────────────── Order Desk grouping ───────────────────────── */

const STAGE_BY_STATUS: Record<POStatus, POStage> = {
  draft: 'draft',
  submitted: 'waiting',
  confirmed: 'delivery',
  shipped: 'delivery',
  partially_received: 'receive',
  received: 'receive',
  reconciled: 'done',
  cancelled: 'done',
}

export function stageOf(status: POStatus): POStage {
  return STAGE_BY_STATUS[status]
}

/* ─────────────────── "NEW for you" badge (localStorage) ─────────────────── */

const SEEN_KEY = 'shk.po.seen'

export function loadSeenPOs(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function markPOSeen(poId: string): Set<string> {
  const next = loadSeenPOs()
  next.add(poId)
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next]))
  } catch {
    /* private mode / quota — the badge is cosmetic, never block on it */
  }
  return next
}

/**
 * An order is NEW *for me* when the other person handed it over (submitted,
 * authored by someone else) and I have not opened it yet.
 */
export function isNewForMe(
  order: Pick<PurchaseOrder, 'id' | 'status' | 'created_by'>,
  myUserId: string | null,
  seen: Set<string>,
): boolean {
  if (order.status !== 'submitted') return false
  if (!order.created_by || !myUserId) return false
  if (order.created_by === myUserId) return false
  return !seen.has(order.id)
}

/* ──────────────────────────────── Hook ──────────────────────────────── */

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
  updatePO: (poId: string, patch: UpdatePOPatch) => Promise<UpdatePOResult>
  fetchLines: (poId: string) => Promise<POLine[]>
  fetchLinkedReceipts: (poId: string) => Promise<LinkedReceipt[]>
  attachReceipt: (poId: string, storagePath: string, uploadedBy: string) => Promise<string | null>
  parseLinkedReceipt: (inboxId: string) => Promise<{ ok: boolean; error?: string }>
  fetchReceivedSummary: (poId: string) => Promise<ReceivedLineSummary[]>
  stations: Station[]
  myUserId: string | null
}

export function usePurchaseOrders(): UsePurchaseOrdersResult {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [isCreating, setIsCreating] = useState(false)
  const [stations, setStations] = useState<Station[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)

  // Identity drives the author chip and the NEW badge.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setMyUserId(data.user?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('stations')
      .select('id, code, name, floor')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!cancelled) setStations((data ?? []) as Station[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    setError(null)

    let query = supabase
      .from('purchase_orders')
      .select(
        'id, po_number, supplier_id, status, expected_date, delivery_window, notes, subtotal, discount_total, vat_amount, delivery_fee, grand_total, deliver_to_station_id, created_by, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(100)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    // Separate queries + JS join (RULE: no implicit .select('table(col)') joins).
    const [poRes, suppRes, staffRes] = await Promise.all([
      query,
      supabase
        .from('suppliers')
        .select('id, name, phone, line_id, website, default_delivery_fee'),
      supabase.from('staff').select('name, auth_user_id').not('auth_user_id', 'is', null),
    ])

    if (poRes.error) {
      setError(poRes.error.message)
      setIsLoading(false)
      return
    }

    const suppMap = new Map(
      (suppRes.data ?? []).map((s: {
        id: string
        name: string
        phone: string | null
        line_id: string | null
        website: string | null
        default_delivery_fee: number | null
      }) => [s.id, s]),
    )
    const authorMap = new Map(
      (staffRes.data ?? []).map((s: { name: string; auth_user_id: string }) => [s.auth_user_id, s.name]),
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

    const num = (v: unknown): number | null => (v == null ? null : Number(v))

    const merged: PurchaseOrder[] = (poRes.data ?? []).map((p) => {
      const supp = suppMap.get(p.supplier_id)
      return {
        id: p.id,
        po_number: p.po_number,
        supplier_id: p.supplier_id,
        supplier_name: supp?.name ?? 'Unknown',
        status: p.status as POStatus,
        expected_date: p.expected_date,
        delivery_window: p.delivery_window,
        notes: p.notes,
        subtotal: num(p.subtotal),
        discount_total: num(p.discount_total),
        vat_amount: num(p.vat_amount),
        delivery_fee: num(p.delivery_fee),
        grand_total: num(p.grand_total),
        deliver_to_station_id: p.deliver_to_station_id,
        created_by: p.created_by,
        author_name: p.created_by ? (authorMap.get(p.created_by) ?? null) : null,
        created_at: p.created_at,
        line_count: lineCounts.get(p.id) ?? 0,
        supplier_phone: supp?.phone ?? null,
        supplier_line_id: supp?.line_id ?? null,
        supplier_website: supp?.website ?? null,
        supplier_default_delivery_fee: num(supp?.default_delivery_fee),
      }
    })

    setOrders(merged)
    setIsLoading(false)
  }, [statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useCoalescedRealtimeRefetch('po-live', [{ table: 'purchase_orders' }],
    () => { fetchOrders({ silent: true }) })

  const createPO = useCallback(
    async (payload: CreatePOPayload): Promise<CreatePOResult> => {
      setIsCreating(true)
      const { data, error: rpcError } = await supabase.rpc('fn_create_purchase_order', {
        p_payload: payload,
      })
      setIsCreating(false)

      if (rpcError) return { ok: false, error: rpcError.message }
      // The RPC traps its own errors into { ok:false, error } (EXCEPTION WHEN
      // OTHERS), so surface that verbatim; guard the null/unexpected case too.
      return (data as CreatePOResult | null) ?? { ok: false, error: 'No response from server' }
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
      // Optimistic status change — no full refetch. If a status filter is
      // active and the row no longer matches it, drop it from the view;
      // otherwise patch the status in place (supplier_name / line_count kept).
      setOrders((prev) =>
        statusFilter !== 'all' && status !== statusFilter
          ? prev.filter((o) => o.id !== poId)
          : prev.map((o) => (o.id === poId ? { ...o, status } : o)),
      )
      return true
    },
    [statusFilter],
  )

  /**
   * Header/line edits go through `fn_update_po` (mig 379), which validates
   * everything before it writes and recomputes the totals. We patch the row
   * locally from the returned totals instead of refetching — the coalesced
   * realtime subscription reconciles anything server-side we did not model.
   */
  const updatePO = useCallback(
    async (poId: string, patch: UpdatePOPatch): Promise<UpdatePOResult> => {
      const { data, error: rpcError } = await supabase.rpc('fn_update_po', {
        p_po_id: poId,
        p_patch: patch,
      })

      if (rpcError) return { ok: false, error: rpcError.message }
      const result = (data as UpdatePOResult | null) ?? {
        ok: false,
        error: 'No response from server',
      }
      if (!result.ok) return result

      setOrders((prev) =>
        prev.map((o) =>
          o.id === poId
            ? {
                ...o,
                ...(patch.expected_date !== undefined ? { expected_date: patch.expected_date } : {}),
                ...(patch.delivery_window !== undefined
                  ? { delivery_window: patch.delivery_window }
                  : {}),
                ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
                ...(patch.delivery_fee !== undefined ? { delivery_fee: patch.delivery_fee } : {}),
                ...(patch.deliver_to_station_id !== undefined
                  ? { deliver_to_station_id: patch.deliver_to_station_id }
                  : {}),
                subtotal: result.subtotal ?? o.subtotal,
                grand_total: result.grand_total ?? o.grand_total,
                line_count: result.line_count ?? o.line_count,
              }
            : o,
        ),
      )
      return result
    },
    [],
  )

  const fetchLines = useCallback(async (poId: string): Promise<POLine[]> => {
    const { data: poRow } = await supabase
      .from('purchase_orders')
      .select('supplier_id')
      .eq('id', poId)
      .single()

    const [lineRes, nomRes] = await Promise.all([
      supabase
        .from('po_lines')
        .select('id, po_id, nomenclature_id, sku_id, qty_ordered, unit, unit_price_expected, total_expected, destination_station_id, sort_order, notes')
        .eq('po_id', poId)
        .order('sort_order'),
      supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit'),
    ])

    if (lineRes.error) return []

    // Thai names live in supplier_catalog, scoped to this order's supplier.
    // They never render in the UI — only in the copy-order text (spec §6.4).
    let thMap = new Map<string, string>()
    if (poRow?.supplier_id) {
      const { data: catRows } = await supabase
        .from('supplier_catalog')
        .select('nomenclature_id, product_name_th')
        .eq('supplier_id', poRow.supplier_id)
        .not('product_name_th', 'is', null)
        .not('nomenclature_id', 'is', null)

      thMap = new Map(
        (catRows ?? [])
          .filter((c: { nomenclature_id: string | null; product_name_th: string | null }) =>
            c.nomenclature_id && c.product_name_th,
          )
          .map((c: { nomenclature_id: string | null; product_name_th: string | null }) => [
            c.nomenclature_id as string,
            c.product_name_th as string,
          ]),
      )
    }

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
        product_name_th: thMap.get(l.nomenclature_id) ?? null,
        product_code: nom?.product_code ?? '',
        base_unit: nom?.base_unit ?? 'pcs',
        qty_ordered: Number(l.qty_ordered),
        unit_price_expected: l.unit_price_expected ? Number(l.unit_price_expected) : null,
        total_expected: l.total_expected ? Number(l.total_expected) : null,
      } as POLine
    })
  }, [])

  /** Receipts attached to this PO (receipt_inbox.po_id, mig 379). */
  const fetchLinkedReceipts = useCallback(async (poId: string): Promise<LinkedReceipt[]> => {
    const { data, error: err } = await supabase
      .from('receipt_inbox')
      .select('id, status, photo_urls, created_at, parsed_at, parsed_payload')
      .eq('po_id', poId)
      .order('created_at', { ascending: false })

    if (err || !data) return []

    const num = (v: unknown): number | null => (v == null ? null : Number(v))

    /**
     * The parser splits items across food_items / opex_items / capex_items and
     * also keeps a flat line_items. Read them all, but keep only entries it
     * resolved to a real product — a name-based match into a screen that
     * writes expenses would be guesswork.
     */
    const items = (p: Record<string, unknown> | null): ParsedReceiptItem[] => {
      if (!p) return []
      const buckets = ['line_items', 'food_items', 'opex_items', 'capex_items']
      const seen = new Set<string>()
      const out: ParsedReceiptItem[] = []
      for (const key of buckets) {
        const arr = p[key]
        if (!Array.isArray(arr)) continue
        for (const raw of arr) {
          const it = raw as Record<string, unknown>
          const nomId = it.nomenclature_id
          if (typeof nomId !== 'string' || seen.has(nomId)) continue
          seen.add(nomId)
          out.push({
            nomenclature_id: nomId,
            unit_price: num(it.unit_price),
            quantity: num(it.quantity),
          })
        }
      }
      return out
    }

    return data.map((r) => {
      const p = (r.parsed_payload ?? null) as Record<string, unknown> | null
      return {
        id: r.id,
        status: r.status,
        photo_urls: (r.photo_urls ?? []) as string[],
        created_at: r.created_at,
        parsed_at: r.parsed_at,
        parsed: p
          ? {
              amount_original: num(p.amount_original),
              vat_amount: num(p.vat_amount),
              discount_total: num(p.discount_total),
              delivery_fee: num(p.delivery_fee),
              invoice_number: (p.invoice_number as string | null) ?? null,
              transaction_date: (p.transaction_date as string | null) ?? null,
              has_tax_invoice: (p.has_tax_invoice as boolean | null) ?? null,
              payment_method: (p.payment_method as string | null) ?? null,
              paid_by: (p.paid_by as string | null) ?? null,
              items: items(p),
            }
          : null,
      }
    })
  }, [])

  /**
   * Runs the SAME ocr-receipt function the standalone inbox uses. It exists
   * here because linking a receipt to a PO removes it from the inbox list
   * (single-writer rule), which also removed its only parse trigger — without
   * this a PO receipt could be attached but never read.
   */
  const parseLinkedReceipt = useCallback(
    async (inboxId: string): Promise<OcrParseResult> =>
      // Same trigger, same model preference, same claude-sub handling as the
      // receipt inbox — one implementation, in lib/ocrParse.
      runOcrParse(inboxId, getStoredOcrModel()),
    [],
  )

  /**
   * Files the photo in the SAME receipts bucket + inbox the standalone flow
   * uses, only pre-linked to this PO. The regular finance pipeline parses it;
   * `fn_approve_po` stays the single expense writer (spec §6.8).
   */
  const attachReceipt = useCallback(
    async (poId: string, storagePath: string, uploadedBy: string): Promise<string | null> => {
      const { error: err } = await supabase.from('receipt_inbox').insert({
        uploaded_by: uploadedBy,
        photo_urls: [storagePath],
        po_id: poId,
      })
      return err ? err.message : null
    },
    [],
  )

  /**
   * What actually arrived, per line — powers the discrepancy summary shown
   * before reconciling. Two queries + JS join rather than a nested select.
   */
  const fetchReceivedSummary = useCallback(async (poId: string): Promise<ReceivedLineSummary[]> => {
    const { data: records } = await supabase
      .from('receiving_records')
      .select('id')
      .eq('po_id', poId)

    const recordIds = (records ?? []).map((r: { id: string }) => r.id)
    if (recordIds.length === 0) return []

    const { data: lines } = await supabase
      .from('receiving_lines')
      .select('po_line_id, qty_expected, qty_received, qty_rejected, reject_reason')
      .in('receiving_id', recordIds)

    // A line can be received across several partial deliveries — sum them.
    const byLine = new Map<string, ReceivedLineSummary>()
    for (const l of lines ?? []) {
      const key = (l.po_line_id as string | null) ?? 'unlinked'
      const prev = byLine.get(key)
      const next: ReceivedLineSummary = {
        po_line_id: l.po_line_id,
        qty_expected: Number(l.qty_expected ?? 0),
        qty_received: (prev?.qty_received ?? 0) + Number(l.qty_received ?? 0),
        qty_rejected: (prev?.qty_rejected ?? 0) + Number(l.qty_rejected ?? 0),
        reject_reason: (l.reject_reason as string | null) ?? prev?.reject_reason ?? null,
      }
      byLine.set(key, next)
    }
    return [...byLine.values()]
  }, [])

  return {
    orders, isLoading, error, refetch: fetchOrders,
    statusFilter, setStatusFilter,
    createPO, isCreating,
    updateStatus, updatePO, fetchLines,
    fetchLinkedReceipts, parseLinkedReceipt, attachReceipt, fetchReceivedSummary,
    stations, myUserId,
  }
}
