// ═══════════════════════════════════════════════════════════
// Types: Receipt Parsing & Staging Area
// Phase 6.1: Financial Reconciliation + Anti-Hallucination
// ═══════════════════════════════════════════════════════════

/** AI-classified document positions from the uploaded images array */
export interface DocumentClassification {
  tax_invoice_index: number | null
  supplier_receipt_index: number | null
  bank_slip_index: number | null
}

/** Receipt footer — financial summary extracted from ZONE 3 */
export interface ReceiptFooter {
  /** Sum before discounts (รวม, Subtotal) */
  subtotal: number
  /** Total receipt discount as NEGATIVE number (ส่วนลด, e.g., -500). 0 if none */
  discount_total: number
  /** VAT amount. 0 if VAT-inclusive pricing */
  vat_amount: number
  /** Phase 6.6: Delivery/shipping charge (positive number). 0 if no delivery */
  delivery_fee?: number
  /** Final amount paid (ยอดสุทธิ, Net, Grand Total) */
  grand_total: number
}

/** Reconciliation status from post-processing */
export interface Reconciliation {
  /** "balanced" = all checks pass, "items_mismatch" = items sum ≠ subtotal, "footer_mismatch" = footer formula fails */
  status: 'balanced' | 'items_mismatch' | 'footer_mismatch'
  /** Computed sum of line_items[].total_price */
  items_sum: number
  /** Human-readable formula, e.g., "4700 + (-500) + 0 = 4200" */
  formula: string
}

/** Unified line item from Edge Function strict OCR (Phase 6.1) */
export interface LineItem {
  line_number: number
  supplier_sku: string | null
  original_name: string
  translated_name: string
  quantity: number
  unit: string
  /** Unit exactly as printed on receipt (e.g., "แพ็ค", "bag 500g") — preserved for UoM conversion */
  purchase_unit?: string
  unit_price: number
  total_price: number
  category: 'food' | 'capex' | 'opex' | 'uncategorized'
  /** AI confidence: "high" = clear text, "medium" = some guessing, "low" = significant guessing */
  confidence?: 'high' | 'medium' | 'low'
  /** Phase 6.6: Brand name if visible on receipt (display-only) */
  brand?: string
  /** Phase 6.6: Package weight as printed on receipt, e.g. "500g", "1kg" (display-only) */
  package_weight?: string
  /** Phase 6.7: Verified English name from Makro product database (populated by GAS STEP 5.5) */
  makro_name?: string
  /** Phase 6.8: Full product title as on Makro website (e.g. "KNORR Corn Flour 700 g") */
  full_title?: string
  /** Post-processing warning (e.g., price math mismatch) */
  _warning?: string
  /** Populated by frontend mapping engine (useSupplierMapping) */
  nomenclature_id?: string | null
  /** Phase 10: Resolved SKU id */
  sku_id?: string | null
  /** Phase 10: Product barcode (EAN/UPC) for SKU resolution */
  barcode?: string | null
}

/** Sum validation from Edge Function (legacy — kept for backward compat) */
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
  /** Phase 6.1: Structured financial footer (discount, VAT, grand total) */
  footer?: ReceiptFooter
  /** Phase 6.2: How many product rows AI counted in the receipt image */
  item_count_observed?: number
  /** Unified line items from strict OCR */
  line_items?: LineItem[]
  /** Legacy arrays — populated by Edge Function from line_items for backward compat */
  food_items: FoodItem[]
  capex_items: CapexItem[]
  opex_items: OpexItem[]
  /** AI classification of which uploaded image is which document type */
  documents?: DocumentClassification
  /** Phase 6.1: Reconciliation result — formula check */
  _reconciliation?: Reconciliation
  /** Legacy: Set by Edge Function when line_items sum ≠ total_amount */
  _sum_mismatch?: SumMismatch
  /** Post-processing warnings array */
  _warnings?: string[]
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
  /** Phase 6.6: Brand name if visible (display-only chip in StagingArea) */
  brand?: string
  /** Phase 6.6: Package weight as printed, e.g. "500g" (display-only chip) */
  package_weight?: string
  /** Phase 6.7: Verified English name from Makro product database */
  makro_name?: string
  /** Phase 6.8: Full product title as on Makro website */
  full_title?: string
  /** Phase 10: Resolved SKU id */
  sku_id?: string | null
  /** Phase 10: Product barcode for SKU resolution */
  barcode?: string | null
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
  supplier_sku?: string | null
  /** Product category L2 id (e.g., NF-CLN Cleaning) */
  category_id?: string | null
  /** Product category L3 id (e.g., NF-CLN-DSH Dishwashing) */
  sub_category_id?: string | null
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
  /** Phase 6.1: Receipt-level discount (negative number) */
  discount_total: number
  /** Phase 6.1: VAT amount */
  vat_amount: number
  /** Phase 6.6: Delivery/shipping charge (positive number) */
  delivery_fee?: number
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
