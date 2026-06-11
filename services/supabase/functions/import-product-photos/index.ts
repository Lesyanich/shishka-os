// ═══════════════════════════════════════════════════════════
// Edge Function: import-product-photos
//
// Rehosts external product images into our own Supabase Storage
// (bucket: nomenclature-photos) and repoints nomenclature.image_url
// + nomenclature.customer_photo_url at the stored copy.
//
// Why: hot-linking a supplier CDN (e.g. baradachocolate.com) is
// fragile. We pull the bytes once, store them ourselves, and serve
// from our public bucket. Runs with the service role so it bypasses
// storage RLS (direct anon uploads were blocked before).
//
// Actions:
//   GET ?action=list[&prefix=SALE-CHOC_]
//        → ordered rows that still point at an external host
//   GET ?i=N[&prefix=SALE-CHOC_]
//        → rehost a single row by index in that list
//   GET ?all=1[&prefix=SALE-CHOC_]
//        → rehost every matching row sequentially
//
// A row is "external" when its image_url is set and does NOT already
// live under our Supabase storage public path.
// ═══════════════════════════════════════════════════════════

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "nomenclature-photos";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function db() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

interface Row {
  id: string;
  product_code: string;
  name: string;
  image_url: string | null;
}

function isExternal(url: string | null): boolean {
  if (!url) return false;
  // already rehosted into our own bucket?
  return !url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

async function listRows(prefix: string): Promise<Row[]> {
  const { data, error } = await db()
    .from("nomenclature")
    .select("id, product_code, name, image_url")
    .like("product_code", `${prefix}%`)
    .order("product_code");
  if (error) throw error;
  return (data as Row[]).filter((r) => isExternal(r.image_url));
}

function extFromContentType(ct: string, fallbackUrl: string): { ext: string; ctype: string } {
  if (ct.includes("png")) return { ext: "png", ctype: "image/png" };
  if (ct.includes("webp")) return { ext: "webp", ctype: "image/webp" };
  if (ct.includes("jpeg") || ct.includes("jpg")) return { ext: "jpg", ctype: "image/jpeg" };
  const lower = fallbackUrl.toLowerCase();
  if (lower.includes(".png")) return { ext: "png", ctype: "image/png" };
  if (lower.includes(".webp")) return { ext: "webp", ctype: "image/webp" };
  return { ext: "jpg", ctype: "image/jpeg" };
}

async function processOne(row: Row) {
  const src = row.image_url!;
  const resp = await fetch(src, { redirect: "follow" });
  if (!resp.ok) throw new Error(`download failed ${resp.status} for ${src}`);
  const ct = resp.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length < 512) throw new Error(`suspiciously small image (${bytes.length}B) from ${src}`);

  const { ext, ctype } = extFromContentType(ct, src);
  const path = `${row.id}/menu.${ext}`;

  const supabase = db();
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: ctype, upsert: true });
  if (up.error) throw up.error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const upd = await supabase
    .from("nomenclature")
    .update({ image_url: url, customer_photo_url: url })
    .eq("id", row.id);
  if (upd.error) throw upd.error;

  return { product_code: row.product_code, ok: true, url, kb: Math.round(bytes.length / 1024), ext };
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const prefix = url.searchParams.get("prefix") ?? "SALE-CHOC_";
    const rows = await listRows(prefix);

    if (url.searchParams.get("all") === "1") {
      const results = [];
      for (const r of rows) {
        try {
          results.push(await processOne(r));
        } catch (e) {
          results.push({ product_code: r.product_code, ok: false, error: String((e as Error)?.message ?? e) });
        }
      }
      return new Response(JSON.stringify({ total: rows.length, results }, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }

    const iParam = url.searchParams.get("i");
    if (iParam !== null) {
      const i = parseInt(iParam, 10);
      if (isNaN(i) || i < 0 || i >= rows.length) {
        return new Response(JSON.stringify({ error: "bad index", total: rows.length }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const r = await processOne(rows[i]);
      return new Response(JSON.stringify(r, null, 2), { headers: { "content-type": "application/json" } });
    }

    // default: list
    return new Response(
      JSON.stringify(
        { total: rows.length, rows: rows.map((r, i) => ({ i, product_code: r.product_code, src: r.image_url })) },
        null,
        2,
      ),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }, null, 2), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
