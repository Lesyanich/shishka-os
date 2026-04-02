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
  notes: string | null
  subtotal: number | null
  grand_total: number | null
  created_at: string
  line_count: number
}

export interface POLine {
  id: string
  po_id: string
  nomenclature_id: string
  sku_id: string | null
  product_name: string
  product_code: string
  base_unit: string
  qty_ordered: number
  unit: string
  unit_price_expected: number | null
  total_expected: number | null
  sort_order: number
  notes: string | null
}

export interface POLineInput {
  nomenclature_id: string
  sku_id?: string | null
  qty_ordered: number
  unit?: string
  unit_price_expected?: number | null
  notes?: string | null
}

export interface CreatePOPayload {
  supplier_id: string
  expected_date: string | null
  notes: string | null
  lines: POLineInput[]
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
