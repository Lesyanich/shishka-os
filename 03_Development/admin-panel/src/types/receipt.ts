// ═══════════════════════════════════════════════════════════
// Types: Receipt Parsing & Staging Area
// Phase 4.6: Perfect OCR & Smart Mapping Engine
// ═══════════════════════════════════════════════════════════

/** AI-classified document positions from the uploaded images array */
export interface DocumentClassification {
  tax_invoice_index: number | null
  supplier_receipt_index: number | null
  bank_slip_index: number | null
}

/** Unified line item from Edge Function strict OCR (Phase 4.6) */
export interface LineItem {
  line_number: number
  supplier_sku: string | null
  original_name: string
  translated_name: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  category: 'food' | 'capex' | 'opex' | 'uncategorized'
  /** Populated by frontend mapping engine (useSupplierMapping) */
  nomenclature_id?: string | null
}

/** Sum validation from Edge Function */
export interface SumMismatch {
  line_items_sum: number
  declared_total: number
  difference: number
}

/** Parsed receipt data returned by the parse-receipts Edge Function */
export interface ParsedReceipt {
  supplier_name: string
  invoice_number: string | null
  total_amount: number
  currency: string
  transaction_date: string // YYYY-MM-DD — strictly from document, never today
  /** NEW (Phase 4.6): Unified line items from strict OCR */
  line_items?: LineItem[]
  /** Legacy arrays — populated by Edge Function from line_items for backward compat */
  food_items: FoodItem[]
  capex_items: CapexItem[]
  opex_items: OpexItem[]
  /** AI classification of which uploaded image is which document type */
  documents?: DocumentClassification
  /** Set by Edge Function when line_items sum ≠ total_amount */
  _sum_mismatch?: SumMismatch
}

/** Food ingredient line item → inserts into purchase_logs */
export interface FoodItem {
  name: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  /** Assigned by user in StagingArea dropdown, or '__NEW__' for auto-create, or null */
  nomenclature_id?: string | null
  /** Supplier item code (e.g. Makro barcode) — used for smart mapping */
  supplier_sku?: string | null
  /** Original name as printed on receipt (Thai) — used for smart mapping fallback */
  original_name?: string | null
}

/** Capital equipment line item → inserts into capex_transactions */
export interface CapexItem {
  name: string
  quantity: number
  unit_price: number
  total_price: number
}

/** Consumable/operational line item → inserts into opex_items */
export interface OpexItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
}

/** Receipt image URLs from MagicDropzone Storage upload */
export interface ReceiptUrls {
  supplier?: string
  bank?: string
  tax?: string
}

/** Supplier→Nomenclature mapping record (from supplier_item_mapping table) */
export interface SupplierItemMapping {
  id: string
  supplier_id: string
  supplier_sku: string | null
  original_name: string
  nomenclature_id: string
  match_count: number
}

/** Phase 4.14: Async receipt parsing job (receipt_jobs table) */
export interface ReceiptJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  image_urls: string[]
  result: ParsedReceipt | null
  error: string | null
  created_at: string
  completed_at: string | null
  duration_ms: number | null
  model: string
}

/** Payload sent to fn_approve_receipt RPC */
export interface ApprovePayload {
  transaction_date: string
  flow_type: string
  category_code: number | null
  sub_category_code: number | null
  supplier_id: string | null
  details: string
  comments: string | null
  invoice_number: string | null
  amount_original: number
  currency: string
  exchange_rate: number
  paid_by: string
  payment_method: string
  status: string
  has_tax_invoice: boolean
  receipt_supplier_url: string | null
  receipt_bank_url: string | null
  tax_invoice_url: string | null
  food_items: FoodItem[]
  capex_items: CapexItem[]
  opex_items: OpexItem[]
}
