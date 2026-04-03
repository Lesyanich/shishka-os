/**
 * approve-receipt — Atomic insert via fn_approve_receipt RPC
 *
 * Writes Hub (expense_ledger) + Spokes (purchase_logs, capex_transactions, opex_items)
 * in a single PostgreSQL transaction.
 */

import { getSupabase } from "../lib/supabase.js";
import { emitBusinessTask } from "../lib/emit-task.js";

interface FoodItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  nomenclature_id?: string | null;
  supplier_sku?: string | null;
  original_name?: string | null;
  brand?: string | null;
  package_weight?: string | null;
  barcode?: string | null;
}

interface CapexItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  asset_id?: string | null;
}

interface OpexItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

export interface ApproveReceiptArgs {
  transaction_date: string;
  flow_type: string;
  category_code?: number | null;
  sub_category_code?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  details: string;
  comments?: string | null;
  invoice_number?: string | null;
  amount_original: number;
  currency?: string;
  exchange_rate?: number;
  discount_total?: number;
  vat_amount?: number;
  delivery_fee?: number;
  paid_by: string;
  payment_method?: string;
  status?: string;
  has_tax_invoice?: boolean;
  receipt_supplier_url?: string | null;
  receipt_bank_url?: string | null;
  tax_invoice_url?: string | null;
  food_items?: FoodItem[];
  capex_items?: CapexItem[];
  opex_items?: OpexItem[];
  /** Full parsed receipt data — stored as JSONB for future data mining */
  raw_parse?: Record<string, any> | null;
}

export async function approveReceipt(args: ApproveReceiptArgs) {
  const sb = getSupabase();

  // Build the payload expected by fn_approve_receipt
  const payload = {
    transaction_date: args.transaction_date,
    flow_type: args.flow_type || "COGS",
    category_code: args.category_code ?? null,
    sub_category_code: args.sub_category_code ?? null,
    supplier_id: args.supplier_id ?? null,
    supplier_name: args.supplier_name ?? null,
    details: args.details,
    comments: args.comments ?? null,
    invoice_number: args.invoice_number ?? null,
    amount_original: args.amount_original,
    currency: args.currency || "THB",
    exchange_rate: args.exchange_rate ?? 1,
    discount_total: args.discount_total ?? 0,
    vat_amount: args.vat_amount ?? 0,
    delivery_fee: args.delivery_fee ?? 0,
    paid_by: args.paid_by,
    payment_method: args.payment_method || "cash",
    status: args.status || "paid",
    has_tax_invoice: args.has_tax_invoice ?? false,
    receipt_supplier_url: args.receipt_supplier_url ?? null,
    receipt_bank_url: args.receipt_bank_url ?? null,
    tax_invoice_url: args.tax_invoice_url ?? null,
    food_items: args.food_items || [],
    capex_items: args.capex_items || [],
    opex_items: args.opex_items || [],
    raw_parse: args.raw_parse ?? null,
  };

  // Validate: at least one spoke must have items
  const totalItems =
    payload.food_items.length +
    payload.capex_items.length +
    payload.opex_items.length;

  if (totalItems === 0) {
    return {
      ok: false,
      error: "Payload must contain at least one item (food, capex, or opex)",
    };
  }

  // Validate: discount must be negative or zero
  if (payload.discount_total > 0) {
    return {
      ok: false,
      error: `discount_total must be negative or zero, got ${payload.discount_total}. Use negative value (e.g., -500)`,
    };
  }

  // Call the RPC
  const { data, error } = await sb.rpc("fn_approve_receipt", {
    p_payload: payload,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      hint: error.hint,
    };
  }

  // data is the RPC response — { expense_id, food_count, capex_count, opex_count, ... }
  const expenseId = data?.expense_id;
  const foodCount = data?.food_count ?? payload.food_items.length;
  const capexCount = data?.capex_count ?? payload.capex_items.length;
  const opexCount = data?.opex_count ?? payload.opex_items.length;

  // Tier 1: emit business task for approved receipt
  await emitBusinessTask({
    title: `Approved: ${payload.supplier_name || "receipt"} | ${payload.amount_original} ${payload.currency}`,
    domain: "finance",
    created_by: "finance-agent",
    status: "done",
    tags: ["receipt", "approved", payload.flow_type.toLowerCase()],
    related_ids: {
      expense_id: expenseId,
      batch_total_thb: payload.amount_original,
      food_count: foodCount,
      capex_count: capexCount,
      opex_count: opexCount,
    },
  });

  return {
    ok: true,
    result: data,
    summary: {
      expense_id: expenseId,
      food_count: foodCount,
      capex_count: capexCount,
      opex_count: opexCount,
      supplier_catalog_updated: data?.supplier_catalog_updated ?? 0,
      total: payload.amount_original,
      currency: payload.currency,
      raw_parse_saved: !!args.raw_parse,
    },
  };
}
