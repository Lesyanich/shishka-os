// ═══════════════════════════════════════════════════════════
// Types: Procurement & Receiving
// Phase 13: Receiving Station Frontend
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

// ── Checklist UI state (extends PendingDeliveryLine) ──

export type CheckStatus = 'pending' | 'ok' | 'issue'

export interface ChecklistLine extends PendingDeliveryLine {
  check_status: CheckStatus
  actual_qty: number
  rejected_qty: number
  reject_reason: RejectReason | null
  note: string | null
}
