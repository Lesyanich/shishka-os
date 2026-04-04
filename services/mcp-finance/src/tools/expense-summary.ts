/**
 * expense-summary — Aggregated financial summary by period
 *
 * Groups expenses by flow_type and category for dashboards and reports.
 */

import { getSupabase } from "../lib/supabase.js";

export interface ExpenseSummaryArgs {
  date_from: string;
  date_to: string;
  group_by?: string;
}

export async function expenseSummary(args: ExpenseSummaryArgs) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("expense_ledger")
    .select(
      "flow_type, category_code, amount_original, amount_thb, currency, status"
    )
    .gte("transaction_date", args.date_from)
    .lte("transaction_date", args.date_to)
    .eq("status", "paid");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      period: { from: args.date_from, to: args.date_to },
      message: "No expenses in this period",
      total_thb: 0,
      by_flow_type: {},
    };
  }

  // Aggregate by flow_type
  const byFlowType: Record<string, { count: number; total_thb: number }> = {};
  let grandTotal = 0;

  for (const row of data) {
    const ft = row.flow_type || "Unknown";
    if (!byFlowType[ft]) byFlowType[ft] = { count: 0, total_thb: 0 };
    byFlowType[ft].count++;
    byFlowType[ft].total_thb += row.amount_thb || 0;
    grandTotal += row.amount_thb || 0;
  }

  // Round totals
  for (const key of Object.keys(byFlowType)) {
    byFlowType[key].total_thb = Math.round(byFlowType[key].total_thb * 100) / 100;
  }

  // Aggregate by category if requested
  let byCategory: Record<number, { count: number; total_thb: number }> | undefined;
  if (args.group_by === "category") {
    byCategory = {};
    for (const row of data) {
      const cc = row.category_code || 0;
      if (!byCategory[cc]) byCategory[cc] = { count: 0, total_thb: 0 };
      byCategory[cc].count++;
      byCategory[cc].total_thb += row.amount_thb || 0;
    }
    for (const key of Object.keys(byCategory)) {
      byCategory[Number(key)].total_thb =
        Math.round(byCategory[Number(key)].total_thb * 100) / 100;
    }
  }

  return {
    period: { from: args.date_from, to: args.date_to },
    total_records: data.length,
    total_thb: Math.round(grandTotal * 100) / 100,
    by_flow_type: byFlowType,
    ...(byCategory ? { by_category: byCategory } : {}),
  };
}
