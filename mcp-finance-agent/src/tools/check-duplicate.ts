/**
 * check-duplicate — Check if a receipt with same supplier + date + amount already exists
 *
 * Prevents double-entry of the same receipt.
 */

import { getSupabase } from "../lib/supabase.js";

export interface CheckDuplicateArgs {
  supplier_name?: string;
  supplier_id?: string;
  date: string;
  amount?: number;
}

export async function checkDuplicate(args: CheckDuplicateArgs) {
  const sb = getSupabase();

  let q = sb
    .from("expense_ledger")
    .select("id, transaction_date, amount_original, details, supplier_id, status, created_at")
    .eq("transaction_date", args.date);

  if (args.supplier_id) {
    q = q.eq("supplier_id", args.supplier_id);
  }

  if (args.amount) {
    // Check for exact amount match
    q = q.eq("amount_original", args.amount);
  }

  const { data, error } = await q;

  if (error) return { error: error.message };

  // If supplier_name given but no supplier_id, filter results by details field
  let matches = data || [];
  if (args.supplier_name && !args.supplier_id) {
    const lowerName = args.supplier_name.toLowerCase();
    matches = matches.filter(
      (r) =>
        r.details?.toLowerCase().includes(lowerName)
    );
  }

  if (matches.length === 0) {
    return {
      is_duplicate: false,
      message: "No matching receipts found — safe to proceed",
    };
  }

  return {
    is_duplicate: true,
    message: `Found ${matches.length} potential duplicate(s)! Review before proceeding.`,
    matches: matches.map((r) => ({
      id: r.id,
      date: r.transaction_date,
      amount: r.amount_original,
      details: r.details,
      status: r.status,
      created_at: r.created_at,
    })),
  };
}
