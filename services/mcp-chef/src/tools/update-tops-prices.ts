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
 * Writes are scoped to the Tops supplier and done as delete-then-insert per
 * batch (the unique index on supplier_catalog is partial — `WHERE barcode IS
 * NOT NULL` — which makes ON CONFLICT upsert unreliable; delete+insert is
 * deterministic and only ever touches Tops rows).
 *
 * Tops sits behind Cloudflare, so the fetch reuses the headless-browser layer
 * from search-tops-catalog (requires playwright).
 */

import { getSupabase } from "../lib/supabase.js";
import { fetchTopsProductsBySkus, type TopsProduct } from "./search-tops-catalog.js";

const TOPS_SUPPLIER_NAME = "Tops";

/** Find or create the "Tops" supplier row; returns its UUID. */
async function ensureTopsSupplier(sb: ReturnType<typeof getSupabase>): Promise<string> {
  const { data: existing, error: selErr } = await sb
    .from("suppliers")
    .select("id")
    .ilike("name", TOPS_SUPPLIER_NAME)
    .eq("is_deleted", false)
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(`suppliers lookup failed: ${selErr.message}`);
  if (existing?.id) return existing.id as string;

  const { data: inserted, error: insErr } = await sb
    .from("suppliers")
    .insert({ name: TOPS_SUPPLIER_NAME })
    .select("id")
    .single();
  if (insErr) throw new Error(`could not create Tops supplier: ${insErr.message}`);
  return inserted.id as string;
}

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

function buildRows(
  pairs: MatchedPair[],
  supplierId: string,
  nomByBarcode: Map<string, string>,
  nowIso: string,
) {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const { ourBarcode, p } of pairs) {
    if (!ourBarcode || p.price_thb <= 0) continue;
    if (seen.has(ourBarcode)) continue;
    seen.add(ourBarcode);
    rows.push({
      supplier_id: supplierId,
      // Store under OUR barcode so the Tops row lines up with our other
      // suppliers' rows for the same product (UPC/EAN forms reconciled).
      barcode: ourBarcode,
      nomenclature_id: nomByBarcode.get(ourBarcode) ?? null,
      last_seen_price: p.price_thb,
      product_name: p.name || null,
      product_name_th: p.name_th || null,
      brand: p.brand || null,
      image_url: p.image_url || null,
      external_url: p.product_url || null,
      source: "tops",
      verified_at: nowIso,
      updated_at: nowIso,
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

  const nowIso = new Date().toISOString();
  const supplierId = await ensureTopsSupplier(sb);
  const rows = buildRows(pairs, supplierId, nomByBarcode, nowIso);
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
    name: r.product_name,
    price_thb: r.last_seen_price,
    linked: !!r.nomenclature_id,
  }));

  if (args.dry_run) {
    return { dry_run: true, ...summary, sample };
  }

  // 4. Delete-then-insert (scoped to Tops supplier) — deterministic refresh.
  const writeBarcodes = rows.map((r) => r.barcode as string);
  const { error: delErr } = await sb
    .from("supplier_catalog")
    .delete()
    .eq("supplier_id", supplierId)
    .in("barcode", writeBarcodes);
  if (delErr) return { error: `delete (pre-insert) failed: ${delErr.message}`, ...summary };

  const { error: insErr } = await sb.from("supplier_catalog").insert(rows);
  if (insErr) return { error: `insert failed: ${insErr.message}`, ...summary };

  return { ok: true, ...summary, supplier_id: supplierId, sample };
}
