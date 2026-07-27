// ═══════════════════════════════════════════════════════════
// Types: Procurement & Receiving
// Phase 13–15: Receiving Station + PO Management + Reconciliation
// ═══════════════════════════════════════════════════════════

export type POStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'shipped'
  | 'partially_received'
  | 'received'
  | 'reconciled'
  | 'cancelled'

export type RejectReason =
  | 'short_delivery'
  | 'damaged'
  | 'wrong_item'
  | 'quality_reject'
  | 'expired'

// ── fn_pending_deliveries return shape ──

export interface PendingDeliveryLine {
  po_line_id: string
  nomenclature_id: string
  sku_id: string | null
  product_name: string
  product_code: string
  base_unit: string
  unit: string
  qty_ordered: number
  qty_already_received: number
  qty_remaining: number
  barcode: string | null
  brand: string | null
}

export interface PendingDelivery {
  po_id: string
  po_number: string
  supplier_name: string
  status: POStatus
  expected_date: string | null
  notes: string | null
  is_overdue: boolean
  line_count: number
  lines: PendingDeliveryLine[]
}

// ── fn_receive_goods input shape ──

export interface ReceivingLineInput {
  po_line_id: string
  nomenclature_id: string
  sku_id: string | null
  qty_expected: number
  qty_received: number
  qty_rejected: number
  reject_reason: RejectReason | null
  notes: string | null
}

export interface ReceiveGoodsPayload {
  po_id: string
  notes: string | null
  lines: ReceivingLineInput[]
}

// ── fn_receive_goods return shape ──

export interface ReceiveGoodsResult {
  ok: boolean
  error?: string
  receiving_id?: string
  full_count?: number
  issue_count?: number
  po_status?: string
}

// ── Phase 14: PO Management ──

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  supplier_name: string
  status: POStatus
  expected_date: string | null
  /** Time window shown next to expected_date, e.g. "06:00–09:00" (mig 379). */
  delivery_window: string | null
  notes: string | null
  subtotal: number | null
  discount_total: number | null
  vat_amount: number | null
  delivery_fee: number | null
  grand_total: number | null
  /** Order-level unload point; each line may override it (mig 379). */
  deliver_to_station_id: string | null
  /** auth.uid() of whoever created the order — drives the author chip. */
  created_by: string | null
  author_name: string | null
  created_at: string
  line_count: number
  // Supplier quick-links, JS-joined from `suppliers` (see RULE-SUPABASE-JOINS).
  supplier_phone: string | null
  supplier_line_id: string | null
  supplier_website: string | null
  supplier_default_delivery_fee: number | null
}

export interface POLine {
  id: string
  po_id: string
  nomenclature_id: string
  sku_id: string | null
  product_name: string
  /** Thai name from supplier_catalog — used ONLY in the copy-order text, never in the UI (spec §6.4). */
  product_name_th: string | null
  product_code: string
  base_unit: string
  qty_ordered: number
  unit: string
  unit_price_expected: number | null
  total_expected: number | null
  destination_station_id: string | null
  sort_order: number
  notes: string | null
}

export interface POLineInput {
  nomenclature_id: string
  sku_id?: string | null
  qty_ordered: number
  unit?: string
  unit_price_expected?: number | null
  destination_station_id?: string | null
  /** stock_request_lines this PO line fulfils — sets po_line_id (mig 379). */
  request_line_ids?: string[]
  notes?: string | null
}

export interface CreatePOPayload {
  supplier_id: string
  expected_date: string | null
  notes: string | null
  delivery_window?: string | null
  delivery_fee?: number
  deliver_to_station_id?: string | null
  lines: POLineInput[]
}

// ── Phase A (mig 379): editable orders ──

/** A station doubles as a warehouse in the connected-stock model (S1). */
export interface Station {
  id: string
  code: string
  name: string
  floor: string
}

/** One entry of `fn_update_po`'s `lines_upsert`: with `id` it updates, without it inserts. */
export interface POLinePatch {
  id?: string
  nomenclature_id?: string
  qty_ordered?: number
  unit?: string
  unit_price_expected?: number | null
  destination_station_id?: string | null
  notes?: string | null
}

/** Header keys are applied only when present — omitting one leaves it untouched. */
export interface UpdatePOPatch {
  expected_date?: string | null
  delivery_window?: string | null
  notes?: string | null
  delivery_fee?: number
  deliver_to_station_id?: string | null
  lines_upsert?: POLinePatch[]
  lines_delete?: string[]
}

export interface UpdatePOResult {
  ok: boolean
  error?: string
  po_id?: string
  line_count?: number
  subtotal?: number
  grand_total?: number
}

/** Order Desk grouping — workflow stages, not raw statuses. */
export type POStage = 'draft' | 'waiting' | 'delivery' | 'receive' | 'done'

/** Ordered vs received vs rejected for one line, read back after receiving. */
export interface ReceivedLineSummary {
  po_line_id: string | null
  qty_expected: number
  qty_received: number
  qty_rejected: number
  reject_reason: string | null
}

/**
 * A receipt attached to this PO (`receipt_inbox.po_id`, mig 379). It rides the
 * regular finance pipeline; its parsed numbers pre-fill reconciliation, and
 * `fn_approve_po` stays the single expense writer (spec §6.8).
 */
export interface LinkedReceipt {
  id: string
  status: string
  photo_urls: string[]
  created_at: string
  parsed_at: string | null
  /** Parsed actuals, keys mirroring ApprovePOPayload. Null until the agent parses it. */
  parsed: {
    amount_original: number | null
    vat_amount: number | null
    discount_total: number | null
    delivery_fee: number | null
    invoice_number: string | null
    transaction_date: string | null
    has_tax_invoice: boolean | null
    payment_method: string | null
    paid_by: string | null
    /**
     * Per-item actuals, only for items the parser resolved to a real product.
     * Items without a nomenclature_id are dropped: matching them to PO lines
     * by name would be guessing, and this feeds a financial screen.
     */
    items: ParsedReceiptItem[]
  } | null
}

export interface ParsedReceiptItem {
  nomenclature_id: string
  unit_price: number | null
  quantity: number | null
}

export interface CreatePOResult {
  ok: boolean
  error?: string
  po_id?: string
  po_number?: string
  line_count?: number
}

// ── Phase 15: Reconciliation ──

export interface ReconciliationLine {
  receiving_line_id: string
  po_line_id: string | null
  nomenclature_id: string
  product_name: string
  product_code: string
  unit: string
  qty_ordered: number
  qty_received: number
  qty_rejected: number
  unit_price_expected: number | null
  unit_price_actual: number | null
  reject_reason: string | null
}

export interface ApprovePOPayload {
  po_id: string
  transaction_date?: string
  flow_type?: string
  amount_original: number
  currency?: string
  exchange_rate?: number
  discount_total?: number
  vat_amount?: number
  delivery_fee?: number
  paid_by?: string
  payment_method?: string
  status?: string
  has_tax_invoice?: boolean
  invoice_number?: string
  details?: string
  comments?: string
  receipt_supplier_url?: string
  receipt_bank_url?: string
  tax_invoice_url?: string
}

export interface ApprovePOResult {
  ok: boolean
  error?: string
  expense_id?: string
  purchase_count?: number
  sku_auto_created?: number
}

// ── Checklist UI state (extends PendingDeliveryLine) ──

export type CheckStatus = 'pending' | 'ok' | 'issue'

export interface ChecklistLine extends PendingDeliveryLine {
  check_status: CheckStatus
  actual_qty: number
  rejected_qty: number
  reject_reason: RejectReason | null
  note: string | null
}
