// ═══════════════════════════════════════════════════════════
// Types: Receipt Parsing & Staging Area
// Phase 4.4: AI Receipt Clustering & Smart Line-Item Routing
// ═══════════════════════════════════════════════════════════

/** AI-classified document positions from the uploaded images array */
export interface DocumentClassification {
  tax_invoice_index: number | null
  supplier_receipt_index: number | null
  bank_slip_index: number | null
}

/** Parsed receipt data returned by the parse-receipts Edge Function */
export interface ParsedReceipt {
  supplier_name: string
  invoice_number: string | null
  total_amount: number
  currency: string
  transaction_date: string // YYYY-MM-DD — strictly from document, never today
  food_items: FoodItem[]
  capex_items: CapexItem[]
  opex_items: OpexItem[]
  /** AI classification of which uploaded image is which document type */
  documents?: DocumentClassification
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
