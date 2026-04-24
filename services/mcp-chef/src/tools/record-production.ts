import { getSupabase } from "../lib/supabase.js";

interface ProductionItem {
  product_code: string;
  quantity: number;
  unit?: string;
  storage?: string;
  notes?: string;
}

interface MatchResult {
  product_code: string;
  product_id: string;
  name: string;
  quantity: number;
  unit: string;
  storage: string;
  notes: string | null;
  logged: boolean;
}

const VALID_STORAGE = ["fridge", "freezer", "fermented", "ambient"] as const;

export async function recordProduction(args: {
  items: ProductionItem[];
  production_date?: string;
}) {
  try {
    const sb = getSupabase();
    const date = args.production_date || new Date().toISOString().slice(0, 10);

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: `Invalid date format: "${date}". Use YYYY-MM-DD.` };
    }

    if (!args.items || args.items.length === 0) {
      return { error: "No items provided. Pass an array of {product_code, quantity, unit?, storage?, notes?}." };
    }

    // Collect all unique search terms for batch lookup
    const searchTerms = [...new Set(args.items.map((i) => i.product_code))];

    // Batch lookup: exact match on product_code first
    const { data: exactMatches } = await sb
      .from("nomenclature")
      .select("id, product_code, name, base_unit, type")
      .in("product_code", searchTerms);

    // Build a map: product_code → nomenclature row
    const codeMap = new Map<string, (typeof exactMatches extends (infer T)[] | null ? T : never)>();
    for (const row of exactMatches || []) {
      codeMap.set(row.product_code, row);
    }

    // For unmatched codes, try fuzzy (ilike) search
    const unmatched = searchTerms.filter((t) => !codeMap.has(t));
    for (const term of unmatched) {
      const { data } = await sb
        .from("nomenclature")
        .select("id, product_code, name, base_unit, type")
        .or(`product_code.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(5);

      if (data && data.length === 1) {
        // Unambiguous match
        codeMap.set(term, data[0]);
      } else if (data && data.length > 1) {
        // Ambiguous — store candidates for reporting
        codeMap.set(term, { ...data[0], _ambiguous: data } as any);
      }
    }

    const matched: MatchResult[] = [];
    const unmatchedItems: { product_code: string; quantity: number; candidates?: { product_code: string; name: string }[] }[] = [];
    const rowsToInsert: any[] = [];

    for (const item of args.items) {
      if (item.quantity <= 0) {
        unmatchedItems.push({
          product_code: item.product_code,
          quantity: item.quantity,
          candidates: [{ product_code: "INVALID", name: "Quantity must be > 0" }],
        });
        continue;
      }

      const storage = item.storage || "fridge";
      if (!VALID_STORAGE.includes(storage as any)) {
        unmatchedItems.push({
          product_code: item.product_code,
          quantity: item.quantity,
          candidates: [{ product_code: "INVALID", name: `Invalid storage: "${storage}". Use: ${VALID_STORAGE.join(", ")}` }],
        });
        continue;
      }

      const found = codeMap.get(item.product_code);
      if (!found) {
        unmatchedItems.push({ product_code: item.product_code, quantity: item.quantity });
        continue;
      }

      if ((found as any)._ambiguous) {
        const candidates = (found as any)._ambiguous as { product_code: string; name: string }[];
        unmatchedItems.push({
          product_code: item.product_code,
          quantity: item.quantity,
          candidates: candidates.map((c) => ({ product_code: c.product_code, name: c.name })),
        });
        continue;
      }

      const unit = item.unit || found.base_unit;

      rowsToInsert.push({
        product_id: found.id,
        production_date: date,
        quantity: item.quantity,
        unit,
        storage,
        batch_notes: item.notes || null,
      });

      matched.push({
        product_code: found.product_code,
        product_id: found.id,
        name: found.name,
        quantity: item.quantity,
        unit,
        storage,
        notes: item.notes || null,
        logged: true,
      });
    }

    // Batch insert all matched rows
    let insertError = null;
    if (rowsToInsert.length > 0) {
      const { error } = await sb.from("production_log").insert(rowsToInsert);
      if (error) insertError = error.message;
    }

    if (insertError) {
      return { error: `DB insert failed: ${insertError}`, matched_before_error: matched };
    }

    return {
      success: true,
      production_date: date,
      logged: matched.length,
      unmatched: unmatchedItems.length,
      items: matched,
      ...(unmatchedItems.length > 0 ? {
        unmatched_items: unmatchedItems,
        hint: "Unmatched items were NOT logged. Use search_products to find correct product_code, then call record_production again for those items.",
      } : {}),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
