import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import encodeWebp from "https://esm.sh/@jsquash/webp@1.4.0/encode";

// Pulls an approved brand photo (public Google Drive file) into the
// nomenclature-photos bucket, downscales it and re-encodes WebP (keeps alpha),
// then points the menu item's image_url at it. Invoke from SQL via pg_net.
//
// Decode/resize uses ImageScript (JS); only the WebP encode uses wasm. The
// wasm linear heap only grows within a worker, so PROCESS ONE IMAGE PER CALL
// (jobs: [singleJob]) and fan out across many concurrent invocations — batching
// several large images into one invocation eventually trips WORKER_RESOURCE_LIMIT.
//
// Auth: shared secret in the request body, supplied by the MENU_PHOTO_SYNC_SECRET
// function secret. Never inline the value here — this repo is public.
//   supabase secrets set MENU_PHOTO_SYNC_SECRET=<value>
const SECRET = Deno.env.get("MENU_PHOTO_SYNC_SECRET");
const BUCKET = "nomenclature-photos";
const MAX_DIM = 1080;        // longest edge after resize
const WEBP_QUALITY = 80;

function detect(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", mime: "image/webp" };
  return null;
}

// Decode (JS) -> downscale longest edge to MAX_DIM -> WebP encode (wasm).
async function toWebp(buf: Uint8Array): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const img = await Image.decode(buf);
  const longest = Math.max(img.width, img.height);
  if (longest > MAX_DIM) {
    const scale = MAX_DIM / longest;
    img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
  }
  const ab = await encodeWebp({ data: img.bitmap, width: img.width, height: img.height }, { quality: WEBP_QUALITY });
  return { bytes: new Uint8Array(ab), w: img.width, h: img.height };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  // Fail closed: without the secret configured, an absent body.secret would
  // otherwise compare undefined === undefined and let every caller through.
  if (!SECRET) return new Response("MENU_PHOTO_SYNC_SECRET not configured", { status: 500 });
  if (typeof body?.secret !== "string" || body.secret !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out: any[] = [];

  for (const j of jobs) {
    try {
      if (!j.driveId || !j.nomenclatureId) { out.push({ ...j, ok: false, stage: "input" }); continue; }
      const url = `https://drive.usercontent.google.com/download?id=${j.driveId}&export=download&confirm=t`;
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) { out.push({ nomenclatureId: j.nomenclatureId, ok: false, stage: "fetch", status: r.status }); continue; }
      const buf = new Uint8Array(await r.arrayBuffer());
      const kind = detect(buf);
      if (!kind) { out.push({ nomenclatureId: j.nomenclatureId, ok: false, stage: "validate", head: Array.from(buf.slice(0, 12)) }); continue; }

      let bytes = buf, ext = kind.ext, mime = kind.mime, format = "original", dim: any = null;
      if (j.compress !== false) {
        try { const c = await toWebp(buf); bytes = c.bytes; ext = "webp"; mime = "image/webp"; format = "webp"; dim = { w: c.w, h: c.h }; }
        catch (e) { format = "fallback:" + String(e).slice(0, 100); }
      }

      const path = `${j.nomenclatureId}/menu-${j.driveId}.${ext}`;
      const up = await supa.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      if (up.error) { out.push({ nomenclatureId: j.nomenclatureId, ok: false, stage: "upload", error: up.error.message }); continue; }
      const pub = supa.storage.from(BUCKET).getPublicUrl(path);
      const imageUrl = `${pub.data.publicUrl}?v=${Date.now()}`;
      if (j.setImageUrl !== false) {
        const upd = await supa.from("nomenclature").update({ image_url: imageUrl }).eq("id", j.nomenclatureId);
        if (upd.error) { out.push({ nomenclatureId: j.nomenclatureId, ok: false, stage: "db", error: upd.error.message, publicUrl: pub.data.publicUrl }); continue; }
      }
      out.push({ nomenclatureId: j.nomenclatureId, ok: true, format, inSize: buf.length, outSize: bytes.length, dim, imageUrl });
    } catch (e) {
      out.push({ nomenclatureId: j.nomenclatureId, ok: false, stage: "exception", error: String(e) });
    }
  }
  return new Response(JSON.stringify({ results: out }), { headers: { "content-type": "application/json" } });
});
