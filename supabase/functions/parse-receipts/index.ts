// ═══════════════════════════════════════════════════════════
// Edge Function: parse-receipts (PROXY MODE v2)
// Phase 5.0c: Zero Body-Read Architecture
// ═══════════════════════════════════════════════════════════
// CRITICAL: This function NEVER calls req.json() or req.text().
// Supabase Edge Functions have a fatal bug where body parsing
// hangs indefinitely on POST requests (~80% of the time).
//
// Instead:
//   job_id comes from URL query parameter (?job_id=xxx)
//   image_urls come from the receipt_jobs DB row
//
// Flow:
//   Frontend → GET /parse-receipts?job_id=xxx → 200 instantly
//   This proxy → reads image_urls from DB → POST to GAS
//   GAS → Gemini → PATCH receipt_jobs → Realtime → Frontend
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const gasWebAppUrl = Deno.env.get("GAS_WEB_APP_URL") ?? ""

const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

console.log("[parse-receipts] PROXY v2 — ZERO BODY READ — module loaded")

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    console.log(`[parse-receipts] HANDLER ENTRY, method=${req.method}, url=${req.url}`)

    // ── Read job_id from URL query param — NO BODY PARSING ──
    const url = new URL(req.url)
    const job_id = url.searchParams.get("job_id")?.trim()
    const model = url.searchParams.get("model")?.trim() || "gemini-2.5-pro"

    if (!job_id) {
      console.error("[parse-receipts] ERROR: job_id missing from URL params")
      return new Response(
        JSON.stringify({ error: "job_id query parameter is required. Use ?job_id=xxx" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    console.log(`[parse-receipts] PROXY: job_id=${job_id}`)

    if (!gasWebAppUrl) {
      console.error("[parse-receipts] ERROR: GAS_WEB_APP_URL not configured")
      return new Response(
        JSON.stringify({ error: "GAS_WEB_APP_URL not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // ── Read image_urls from DB (already saved by frontend) ──
    const { data: jobRow, error: readErr } = await supabaseAdmin
      .from("receipt_jobs")
      .select("image_urls, status")
      .eq("id", job_id)
      .single()

    if (readErr || !jobRow) {
      console.error("[parse-receipts] ERROR: job not found in DB:", readErr?.message)
      return new Response(
        JSON.stringify({ error: `Job ${job_id} not found: ${readErr?.message}` }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const image_urls = jobRow.image_urls
    if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
      console.error("[parse-receipts] ERROR: job has no image_urls")
      return new Response(
        JSON.stringify({ error: "Job has no image_urls in database" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    console.log(`[parse-receipts] PROXY: ${image_urls.length} image(s) from DB, status was: ${jobRow.status}`)

    // ── Mark job as processing ──
    await supabaseAdmin
      .from("receipt_jobs")
      .update({ status: "processing" })
      .eq("id", job_id)

    console.log("[parse-receipts] PROXY: status → processing")

    // ── Fire POST to GAS — use waitUntil if available ──
    // NOTE: supabase_key is NOT sent to GAS (Phase 5.0f).
    // GAS writes to DB via update-receipt-job Edge Function (bypasses RLS).
    // Only supabase_url is needed for GAS to call the Edge Function.
    const gasPayload = JSON.stringify({
      job_id,
      image_urls,
      model,
      supabase_url: supabaseUrl,
    })
    console.log(`[parse-receipts] PROXY: GAS payload ${gasPayload.length} bytes`)

    const gasPromise = fetch(gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: gasPayload,
    })
      .then((r) => console.log(`[parse-receipts] PROXY: GAS responded ${r.status}`))
      .catch((err) =>
        console.error("[parse-receipts] PROXY: GAS invoke failed:", err)
      )

    try {
      // @ts-ignore — EdgeRuntime is Supabase-specific global
      EdgeRuntime.waitUntil(gasPromise)
      console.log("[parse-receipts] PROXY: waitUntil attached ✓")
    } catch (_) {
      console.log("[parse-receipts] PROXY: waitUntil N/A, using detached fetch")
    }

    console.log("[parse-receipts] PROXY: returning 200")
    return new Response(
      JSON.stringify({ ok: true, job_id, images: image_urls.length }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )

  } catch (error) {
    console.error("[parse-receipts] PROXY CRASH:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }
})
