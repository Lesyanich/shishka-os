/**
 * update-inbox — Update receipt_inbox status after processing
 */

import { getSupabase } from "../lib/supabase.js";
import { emitBusinessTask } from "../lib/emit-task.js";

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

  // Tier 1: emit business task when receipt is parsed
  if (args.status === "parsed" && args.parsed_payload) {
    const payload = args.parsed_payload;
    const supplier = payload.supplier_name || "Unknown supplier";
    const amount = payload.amount_original || 0;
    const itemCount =
      (payload.food_items?.length || 0) +
      (payload.capex_items?.length || 0) +
      (payload.opex_items?.length || 0);

    await emitBusinessTask({
      title: `Parsed receipt: ${supplier} | ${amount} THB | ${itemCount} items`,
      domain: "finance",
      created_by: "finance-agent",
      status: payload._duplicate_warning ? "inbox" : "done",
      priority: payload._duplicate_warning ? "high" : "medium",
      tags: ["receipt", payload.supplier_type || "unknown"],
      related_ids: {
        inbox_id: args.inbox_id,
        receipt_date: payload.transaction_date,
        batch_total_thb: amount,
      },
      description: payload._duplicate_warning
        ? `Possible duplicate detected. Review required.`
        : undefined,
    });
  }

  return {
    ok: true,
    updated: data,
  };
}
