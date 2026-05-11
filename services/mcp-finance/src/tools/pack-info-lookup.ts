/**
 * pack-info-lookup — On-demand pack-info cascade lookup
 *
 * Thin read-only wrapper around the pack-info-resolver library. Phase 2 hook
 * and Phase 3 sweep call the resolver internally; this tool exposes the same
 * cascade for ad-hoc agent queries ("what does the cascade say about RAW-X?")
 * without going through receipt approval or the nightly cron.
 *
 * No DB writes. To apply a fix, an owner approves via the Data Health UI
 * (Phase 4 PR2) or waits for the next sweep run.
 *
 * Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md §Components
 * MC task: 91cbaab2-60b8-4bc6-a6c5-414732c24f3a (Phase 4)
 */

import { getSupabase } from "../lib/supabase.js";
import { resolve, createSupabaseProvider } from "../lib/pack-info-resolver/index.js";
import type { ResolverResult, MakroResult } from "../lib/pack-info-resolver/index.js";
import { makroLookup } from "./makro-lookup.js";

export interface PackInfoLookupArgs {
  nomenclature_id: string;
  barcode?: string;
  last_price_thb?: number;
}

export interface PackInfoLookupResponse {
  ok: boolean;
  result?: ResolverResult;
  error?: string;
  errors?: Array<{ stage: "barcode" | "fuzzy"; message: string }>;
}

// ResolveInput.supplier_id is required by the type but never read by resolve().
// See follow-up task to drop the field; sentinel UUID until then.
const SENTINEL_SUPPLIER_ID = "00000000-0000-0000-0000-000000000000";

// Adapter: makro-lookup's return type is a union (single/batch/error); narrow via cast,
// matching the pattern in approve-receipt.ts:174 (Phase 2 wiring).
async function fetchMakro(query: string): Promise<MakroResult> {
  const raw = await makroLookup({ barcode: query });
  const r = raw as { found?: boolean; name?: string | null; unit?: string | null; brand?: string | null };
  return {
    found: r.found === true,
    name: r.name ?? null,
    unit: r.unit ?? null,
    brand: r.brand ?? null,
  };
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function packInfoLookup(args: PackInfoLookupArgs): Promise<PackInfoLookupResponse> {
  if (!isUuid(args.nomenclature_id)) {
    return { ok: false, error: "nomenclature_id must be a UUID" };
  }
  if (args.barcode != null && (typeof args.barcode !== "string" || args.barcode.length === 0)) {
    return { ok: false, error: "barcode, if provided, must be a non-empty string" };
  }
  if (args.last_price_thb != null && (typeof args.last_price_thb !== "number" || !Number.isFinite(args.last_price_thb))) {
    return { ok: false, error: "last_price_thb, if provided, must be a finite number" };
  }

  const sb = getSupabase();

  // Fetch nomenclature row for name/brand fallback (Levels 2 & 4 of cascade)
  const { data: nomRow, error: nomErr } = await sb
    .from("nomenclature")
    .select("name, brand_name")
    .eq("id", args.nomenclature_id)
    .maybeSingle();

  if (nomErr) {
    return { ok: false, error: `nomenclature lookup failed: ${nomErr.message}` };
  }
  if (!nomRow) {
    return { ok: false, error: `nomenclature ${args.nomenclature_id} not found` };
  }

  const provider = createSupabaseProvider(sb, fetchMakro);
  const makroErrors: Array<{ stage: "barcode" | "fuzzy"; message: string }> = [];

  try {
    const result = await resolve(
      {
        nomenclature_id: args.nomenclature_id,
        supplier_id: SENTINEL_SUPPLIER_ID,
        barcode: args.barcode,
        last_price_thb: args.last_price_thb,
        name: nomRow.name ?? undefined,
        brand: (nomRow as { brand_name?: string | null }).brand_name ?? undefined,
        onMakroError: (err, stage) => {
          makroErrors.push({ stage, message: err.message });
        },
      },
      provider,
    );

    return {
      ok: true,
      result,
      ...(makroErrors.length > 0 ? { errors: makroErrors } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `resolver failed: ${message}` };
  }
}
