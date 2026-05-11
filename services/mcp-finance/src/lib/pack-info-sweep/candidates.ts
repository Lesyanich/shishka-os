import type { SupabaseClient } from '@supabase/supabase-js';

export interface SweepCandidate {
  nomenclature_id: string;
  base_unit: string;
  cost_per_unit: number | null;
  name: string | null;
  recent_supplier_id: string;
  recent_barcode: string | null;
  recent_price_per_unit: number | null;
}

export type FetchResult =
  | { ok: true; candidates: SweepCandidate[] }
  | { ok: false; error: string };

/**
 * Wraps the `pack_info_sweep_candidates(p_limit)` Postgres RPC (migration 171).
 * Returns rows of nomenclature joined with their most-recent purchase line,
 * filtered to suspicious base_unit + no recent skip-decision.
 */
export async function fetchSweepCandidates(
  sb: SupabaseClient,
  limit: number,
): Promise<FetchResult> {
  const { data, error } = (await sb.rpc('pack_info_sweep_candidates', { p_limit: limit })) as unknown as {
    data: SweepCandidate[] | null;
    error: { message: string } | null;
  };
  if (error) return { ok: false, error: error.message };
  return { ok: true, candidates: data ?? [] };
}
