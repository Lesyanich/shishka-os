/**
 * update-inbox — Update receipt_inbox status after processing
 */

import { getSupabase } from "../lib/supabase.js";

export interface UpdateInboxArgs {
  inbox_id: string;
  status: string;
  expense_id?: string;
  error_message?: string;
  parsed_payload?: Record<string, any>;
}

export async function updateInbox(args: UpdateInboxArgs) {
  const sb = getSupabase();

  const update: Record<string, unknown> = {
    status: args.status,
  };

  // processed_at = when final processing happened (status=processed)
  // parsed_at = when agent finished parsing (status=parsed)
  if (args.status === "parsed" || args.status === "processed") {
    update.processed_at = new Date().toISOString();
  }

  if (args.parsed_payload) {
    update.parsed_payload = args.parsed_payload;
    update.parsed_at = new Date().toISOString();
  }

  if (args.expense_id) update.expense_id = args.expense_id;
  if (args.error_message) update.error_message = args.error_message;

  const { data, error } = await sb
    .from("receipt_inbox")
    .update(update)
    .eq("id", args.inbox_id)
    .select("id, status, expense_id, processed_at, parsed_at")
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    updated: data,
  };
}
