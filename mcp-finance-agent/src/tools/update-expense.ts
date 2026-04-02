/**
 * update-expense — Partial update of expense_ledger fields
 *
 * Allowed fields: receipt URLs, details, status, payment_method, comments,
 *                 invoice_number, has_tax_invoice.
 * Forbidden fields: amount, flow_type, supplier_id (use approve_receipt for those).
 */

import { getSupabase } from "../lib/supabase.js";

export interface UpdateExpenseArgs {
  expense_id: string;
  receipt_supplier_url?: string;
  receipt_bank_url?: string;
  tax_invoice_url?: string;
  details?: string;
  status?: string;
  payment_method?: string;
  comments?: string;
  invoice_number?: string;
  has_tax_invoice?: boolean;
  /** Full parsed receipt data — stored for future data mining */
  raw_parse?: Record<string, any>;
}

export async function updateExpense(args: UpdateExpenseArgs) {
  const sb = getSupabase();
  const { expense_id, ...fields } = args;

  const update: Record<string, unknown> = {};
  if (fields.receipt_supplier_url !== undefined) update.receipt_supplier_url = fields.receipt_supplier_url;
  if (fields.receipt_bank_url !== undefined) update.receipt_bank_url = fields.receipt_bank_url;
  if (fields.tax_invoice_url !== undefined) update.tax_invoice_url = fields.tax_invoice_url;
  if (fields.details !== undefined) update.details = fields.details;
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.payment_method !== undefined) update.payment_method = fields.payment_method;
  if (fields.comments !== undefined) update.comments = fields.comments;
  if (fields.invoice_number !== undefined) update.invoice_number = fields.invoice_number;
  if (fields.has_tax_invoice !== undefined) update.has_tax_invoice = fields.has_tax_invoice;
  if (fields.raw_parse !== undefined) update.raw_parse = fields.raw_parse;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No fields to update" };
  }

  const { data, error } = await sb
    .from("expense_ledger")
    .update(update)
    .eq("id", expense_id)
    .select("id, transaction_date, details, status, payment_method, receipt_supplier_url, receipt_bank_url, tax_invoice_url, comments, invoice_number, has_tax_invoice")
    .single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, updated: data };
}
