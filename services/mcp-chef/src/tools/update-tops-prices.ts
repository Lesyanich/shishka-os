/**
 * update-tops-prices — Record Tops Online prices into supplier_catalog by barcode.
 *
 * Pre-purchase pricing: fetch live Tops prices for a set of EAN barcodes and
 * upsert them into `supplier_catalog` under a dedicated "Tops" supplier, so the
 * owner can compare Tops vs Makro/etc. before buying.
 *
 * Two modes:
 *  - explicit: pass `barcodes` (e.g. "price these on Tops")
 *  - sweep: `sweep: true` → look up every distinct barcode we already track in
 *    supplier_catalog (build/refresh a full Tops price book).
 *
 * Records EVERY product Tops returns by barcode. `nomenclature_id` is linked
 * when the barcode already maps to one of our products (via supplier_catalog),
 * otherwise left null (still a useful price-book entry).
 *
 * Writes go through `fn_import_supplier_catalog` (mig 394) — the single sink.
 * This tool used to delete-then-insert its own rows and insert its own supplier
 * row. Both were wrong once migrations 388/389 shipped: the delete discarded
 * pack sizes entered by a human via fn_set_catalog_pack and "not ours" verdicts
 * recorded via fn_dismiss_catalog_row, and the direct suppliers INSERT is the
 * pattern that produced three Makro rows (fn_resolve_supplier exists for it).
 * The RPC merges instead, so a sweep refreshes prices without erasing anything
 * a person decided.
 *
 * Tops sits behind Cloudflare, so the fetch reuses the headless-browser layer
 * from search-tops-catalog (requires playwright).
 */

import { getSupabase } from "../lib/supabase.js";
import { fetchTopsProductsBySkus, type TopsProduct } from "./search-tops-catalog.js";

const TOPS_SUPPLIER_NAME = "Tops";

/**
 * Barcode variants for matching. Our catalog and Tops disagree on UPC-12 vs
 * EAN-13 (e.g. we store Heinz as "013000008143", Tops returns
 * "0013000008143"). Generate the equivalent forms so a lookup can hit either.
 */
export function barcodeVariants(input: string): string[] {
  const v = new Set<string>();
  const raw = String(input).trim();
  if (raw) v.add(raw);
  const d = raw.replace(/\D/g, "");
  if (d) {
    v.add(d);
    if (d.length === 12) v.add("0" + d); // UPC-12 → EAN-13
    if (d.length === 11) v.add("00" + d); // UPC-11 → EAN-13
    if (d.length === 13 && d.startsWith("0")) v.add(d.slice(1)); // EAN-13 → UPC-12
  }
  return [...v];
}

/** A Tops product matched back to one of OUR requested barcodes. */
interface MatchedPair {
  ourBarcode: string;
  p: TopsProduct;
}

/**
 * Rows in fn_import_supplier_catalog's payload shape. Note what is NOT here:
 * no conversion_factor. Tops states a price and a title, not a pack size we can
 * trust, and an assumed factor of 1 is exactly the fabricated unit price
 * migration 388 removed. The rows land pack-unknown and show up in
 * v_catalog_pack_missing until a human fills it in.
 */
export function buildRows(pairs: MatchedPair[], nomByBarcode: Map<string, string>) {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const { ourBarcode, p } of pairs) {
    if (!ourBarcode || p.price_thb <= 0) continue;
    if (seen.has(ourBarcode)) continue;
    seen.add(ourBarcode);
    rows.push({
      // Store under OUR barcode so the Tops row lines up with our other
      // suppliers' rows for the same product (UPC/EAN forms reconciled).
      barcode: ourBarcode,
      nomenclature_id: nomByBarcode.get(ourBarcode) ?? null,
      price: p.price_thb,
      name: p.name || null,
      name_th: p.name_th || null,
      brand: p.brand || null,
      image_url: p.image_url || null,
      external_url: p.product_url || null,
    });
  }
  return rows;
}

export async function updateTopsPrices(args: {
  barcodes?: string[];
  sweep?: boolean;
  limit?: number;
  dry_run?: boolean;
}) {
  let sb: ReturnType<typeof getSupabase>;
  try {
    sb = getSupabase();
  } catch (e) {
    return { error: `Supabase not configured: ${(e as Error).message}` };
  }

  // 1. Resolve the barcode list.
  let barcodes: string[] = [];
  if (args.barcodes?.length) {
    barcodes = args.barcodes.map((b) => String(b).trim()).filter(Boolean);
  } else if (args.sweep) {
    const lim = Math.max(1, Math.min(args.limit ?? 300, 2000));
    const { data, error } = await sb
      .from("supplier_catalog")
      .select("barcode")
      .not("barcode", "is", null)
      .neq("barcode", "")
      .limit(5000);
    if (error) return { error: `sweep query failed: ${error.message}` };
    barcodes = [...new Set((data ?? []).map((r) => String(r.barcode)).filter(Boolean))].slice(0, lim);
  } else {
    return {
      error: "Provide `barcodes` (array) or `sweep: true`.",
      hint: "sweep looks up every distinct barcode already in supplier_catalog.",
    };
  }
  if (barcodes.length === 0) return { error: "No barcodes to look up." };

  // 2. Expand each of our barcodes to its UPC/EAN variants and map every
  //    candidate back to our canonical barcode, so a Tops hit on either form
  //    attributes to the right product.
  const candidateToOur = new Map<string, string>();
  const candidates: string[] = [];
  for (const bc of barcodes) {
    for (const v of barcodeVariants(bc)) {
      if (!candidateToOur.has(v)) {
        candidateToOur.set(v, bc);
        candidates.push(v);
      }
    }
  }

  // 3. Fetch live prices from Tops (headless browser + Cloudflare).
  let products: TopsProduct[];
  try {
    products = await fetchTopsProductsBySkus(candidates);
  } catch (e) {
    return {
      error: `Tops fetch failed: ${(e as Error).message}`,
      hint: "Needs playwright (npx playwright install chromium); Cloudflare may be rate-limiting.",
      looked_up: barcodes.length,
    };
  }

  // 4. Attribute each Tops product back to one of our barcodes (via its EAN or
  //    SKU matching a candidate). First hit per our barcode wins.
  const pairs: MatchedPair[] = [];
  const usedOur = new Set<string>();
  for (const p of products) {
    if (p.price_thb <= 0) continue;
    const ourBarcode =
      candidateToOur.get(p.barcode) ?? candidateToOur.get(p.sku) ?? "";
    if (!ourBarcode || usedOur.has(ourBarcode)) continue;
    usedOur.add(ourBarcode);
    pairs.push({ ourBarcode, p });
  }
  if (pairs.length === 0) {
    return {
      message: "Tops returned no priced products matching these barcodes.",
      looked_up: barcodes.length,
      found_on_tops: products.length,
      results: [],
    };
  }

  // 5. Link to our nomenclature by our (canonical) barcode where known.
  const ourFound = pairs.map((pr) => pr.ourBarcode);
  const nomByBarcode = new Map<string, string>();
  const { data: links } = await sb
    .from("supplier_catalog")
    .select("barcode, nomenclature_id")
    .in("barcode", ourFound)
    .not("nomenclature_id", "is", null);
  for (const l of links ?? []) {
    const bc = String(l.barcode);
    if (l.nomenclature_id && !nomByBarcode.has(bc)) nomByBarcode.set(bc, l.nomenclature_id as string);
  }

  const rows = buildRows(pairs, nomByBarcode);
  const matched = rows.filter((r) => r.nomenclature_id).length;

  const summary = {
    looked_up: barcodes.length,
    found_on_tops: pairs.length,
    to_write: rows.length,
    matched_to_nomenclature: matched,
    unmatched: rows.length - matched,
    supplier: TOPS_SUPPLIER_NAME,
  };
  const sample = rows.slice(0, 8).map((r) => ({
    barcode: r.barcode,
    name: r.name,
    price_thb: r.price,
    linked: !!r.nomenclature_id,
  }));

  // 6. One sink for every catalog write (mig 394). p_dry_run maps straight
  //    through, so the preview runs the same classification the commit will.
  //    The supplier is resolved by name, not created here — with p_create tied
  //    to dry-run inside the RPC, a preview cannot fork "Tops".
  const { data, error: rpcErr } = await sb.rpc("fn_import_supplier_catalog", {
    p_supplier_name: TOPS_SUPPLIER_NAME,
    p_source: "scrape",
    p_source_detail: `tops_sweep_${new Date().toISOString().slice(0, 10)}`,
    p_rows: rows,
    p_dry_run: !!args.dry_run,
  });
  if (rpcErr) return { error: `import failed: ${rpcErr.message}`, ...summary };
  const res = (data ?? {}) as Record<string, unknown>;
  if (res.ok === false) return { error: String(res.error ?? "import refused"), ...summary };

  if (args.dry_run) {
    return { dry_run: true, ...summary, would_insert: res.inserted, would_update: res.updated, sample };
  }
  return {
    ok: true,
    ...summary,
    supplier_id: res.supplier_id,
    inserted: res.inserted,
    updated: res.updated,
    pack_unknown: res.pack_unknown,
    sample,
  };
}
