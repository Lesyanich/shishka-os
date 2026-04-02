/**
 * create-inbox — Create receipt_inbox entry when agent starts processing a receipt
 */

import { getSupabase } from "../lib/supabase.js";

export interface CreateInboxArgs {
  uploaded_by?: string;
  receipt_date?: string;
  supplier_hint?: string;
  amount_hint?: number;
  photo_urls?: string[];
  file_paths?: string[];
  notes?: string;
}

export async function createInbox(args: CreateInboxArgs) {
  const sb = getSupabase();

  const row: Record<string, unknown> = {
    status: "pending",
  };

  if (args.uploaded_by) row.uploaded_by = args.uploaded_by;
  if (args.receipt_date) row.receipt_date = args.receipt_date;
  if (args.supplier_hint) row.supplier_hint = args.supplier_hint;
  if (args.amount_hint != null) row.amount_hint = args.amount_hint;
  if (args.photo_urls) row.photo_urls = args.photo_urls;
  if (args.file_paths) row.file_paths = args.file_paths;
  if (args.notes) row.notes = args.notes;

  const { data, error } = await sb
    .from("receipt_inbox")
    .insert(row)
    .select("id, status, upload_date, supplier_hint, notes")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    inbox_id: data.id,
    created: data,
  };
}
