/**
 * verify-expense — Query Hub + all 3 Spokes + receiving_records
 *
 * After fn_approve_receipt, use this to confirm data landed correctly
 * in all tables.
 *
 * Actual column names verified against production DB:
 *   purchase_logs: nomenclature_id, quantity, price_per_unit, total_price, notes
 *   capex_transactions: transaction_id, amount_thb, vendor, details
 *   opex_items: description, quantity, unit, unit_price, total_price
 *   receiving_records: po_id, expense_id, source, received_by, received_at, status
 */

import { getSupabase } from "../lib/supabase.js";

export interface VerifyExpenseArgs {
  expense_id: string;
}

export async function verifyExpense(args: VerifyExpenseArgs) {
  const sb = getSupabase();
  const { expense_id } = args;

  // Query all tables in parallel
  const [hub, purchases, capex, opex, receiving] = await Promise.all([
    // Hub: expense_ledger
    sb
      .from("expense_ledger")
      .select("*")
      .eq("id", expense_id)
      .single(),

    // Spoke 1: purchase_logs
    sb
      .from("purchase_logs")
      .select("id, nomenclature_id, sku_id, supplier_id, quantity, price_per_unit, total_price, invoice_date, notes")
      .eq("expense_id", expense_id)
      .order("id"),

    // Spoke 2: capex_transactions
    sb
      .from("capex_transactions")
      .select("id, transaction_id, amount_thb, transaction_date, transaction_type, category_code, vendor, details")
      .eq("expense_id", expense_id)
      .order("id"),

    // Spoke 3: opex_items
    sb
      .from("opex_items")
      .select("id, description, quantity, unit, unit_price, total_price")
      .eq("expense_id", expense_id)
      .order("id"),

    // Audit: receiving_records
    sb
      .from("receiving_records")
      .select("id, po_id, expense_id, source, received_by, received_at, status, notes")
      .eq("expense_id", expense_id),
  ]);

  // Check for errors
  const errors: string[] = [];
  if (hub.error) errors.push(`expense_ledger: ${hub.error.message}`);
  if (purchases.error) errors.push(`purchase_logs: ${purchases.error.message}`);
  if (capex.error) errors.push(`capex_transactions: ${capex.error.message}`);
  if (opex.error) errors.push(`opex_items: ${opex.error.message}`);
  if (receiving.error) errors.push(`receiving_records: ${receiving.error.message}`);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!hub.data) {
    return {
      ok: false,
      error: `No expense_ledger record found for id=${expense_id}`,
    };
  }

  // Calculate spoke totals for reconciliation
  const purchaseTotal = (purchases.data || []).reduce((s, r) => s + (r.total_price || 0), 0);
  const capexTotal = (capex.data || []).reduce((s, r) => s + (r.amount_thb || 0), 0);
  const opexTotal = (opex.data || []).reduce((s, r) => s + (r.total_price || 0), 0);
  const spokeGrandTotal = Math.round((purchaseTotal + capexTotal + opexTotal) * 100) / 100;

  return {
    ok: true,
    expense_ledger: {
      id: hub.data.id,
      date: hub.data.transaction_date,
      amount: hub.data.amount_original,
      currency: hub.data.currency,
      supplier_id: hub.data.supplier_id,
      details: hub.data.details,
      flow_type: hub.data.flow_type,
      status: hub.data.status,
      discount_total: hub.data.discount_total,
      vat_amount: hub.data.vat_amount,
      delivery_fee: hub.data.delivery_fee,
      invoice_number: hub.data.invoice_number,
      receipt_supplier_url: hub.data.receipt_supplier_url || null,
      receipt_bank_url: hub.data.receipt_bank_url || null,
      tax_invoice_url: hub.data.tax_invoice_url || null,
    },
    purchase_logs: {
      count: purchases.data?.length ?? 0,
      total: Math.round(purchaseTotal * 100) / 100,
      items: purchases.data ?? [],
    },
    capex_transactions: {
      count: capex.data?.length ?? 0,
      total: Math.round(capexTotal * 100) / 100,
      items: capex.data ?? [],
    },
    opex_items: {
      count: opex.data?.length ?? 0,
      total: Math.round(opexTotal * 100) / 100,
      items: opex.data ?? [],
    },
    receiving_records: {
      count: receiving.data?.length ?? 0,
      items: receiving.data ?? [],
    },
    reconciliation: {
      hub_amount: hub.data.amount_original,
      spoke_total: spokeGrandTotal,
      discount: hub.data.discount_total || 0,
      variance: Math.round((hub.data.amount_original - spokeGrandTotal - (hub.data.discount_total || 0)) * 100) / 100,
    },
  };
}
