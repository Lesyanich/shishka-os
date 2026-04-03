/**
 * search-expenses — Query expense_ledger with filters
 *
 * Search by date range, supplier, flow_type, status.
 */

import { getSupabase } from "../lib/supabase.js";

export interface SearchExpensesArgs {
  date_from?: string;
  date_to?: string;
  supplier_id?: string;
  flow_type?: string;
  status?: string;
  limit?: number;
}

export async function searchExpenses(args: SearchExpensesArgs) {
  const sb = getSupabase();
  const limit = args.limit || 50;

  let q = sb
    .from("expense_ledger")
    .select(
      "id, transaction_date, flow_type, amount_original, amount_thb, currency, details, supplier_id, status, payment_method, invoice_number, receipt_supplier_url, receipt_bank_url, tax_invoice_url, created_at"
    )
    .order("transaction_date", { ascending: false })
    .limit(limit);

  if (args.date_from) q = q.gte("transaction_date", args.date_from);
  if (args.date_to) q = q.lte("transaction_date", args.date_to);
  if (args.supplier_id) q = q.eq("supplier_id", args.supplier_id);
  if (args.flow_type) q = q.eq("flow_type", args.flow_type);
  if (args.status) q = q.eq("status", args.status);

  const { data, error } = await q;

  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { message: "No expenses found", results: [] };

  const totalThb = data.reduce((sum, r) => sum + (r.amount_thb || 0), 0);

  return {
    count: data.length,
    total_thb: Math.round(totalThb * 100) / 100,
    results: data.map((r) => ({
      id: r.id,
      date: r.transaction_date,
      flow_type: r.flow_type,
      amount: r.amount_original,
      amount_thb: r.amount_thb,
      currency: r.currency,
      details: r.details,
      supplier_id: r.supplier_id,
      status: r.status,
      payment_method: r.payment_method,
      invoice: r.invoice_number,
      receipt_supplier_url: r.receipt_supplier_url || null,
      receipt_bank_url: r.receipt_bank_url || null,
      tax_invoice_url: r.tax_invoice_url || null,
    })),
  };
}
