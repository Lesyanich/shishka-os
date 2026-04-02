/**
 * check-inbox — Query receipt_inbox for pending/processed receipts
 */

import { getSupabase } from "../lib/supabase.js";

export interface CheckInboxArgs {
  status?: string;
  limit?: number;
}

export async function checkInbox(args: CheckInboxArgs) {
  const sb = getSupabase();
  const status = args.status || "pending";
  const limit = args.limit || 10;

  const { data, error } = await sb
    .from("receipt_inbox")
    .select("*")
    .eq("status", status)
    .order("upload_date", { ascending: false })
    .limit(limit);

  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { message: `No receipt_inbox items with status="${status}"`, count: 0, items: [] };

  return {
    count: data.length,
    items: data.map((r) => ({
      id: r.id,
      uploaded_by: r.uploaded_by,
      upload_date: r.upload_date,
      receipt_date: r.receipt_date,
      supplier_hint: r.supplier_hint,
      amount_hint: r.amount_hint,
      photo_urls: r.photo_urls,
      notes: r.notes,
      status: r.status,
    })),
  };
}
