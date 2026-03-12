// ═══════════════════════════════════════════════════════════
// Edge Function: update-receipt-job (Callback from GAS)
// Phase 5.0e: Solves RLS bypass for GAS → Supabase writes
// ═══════════════════════════════════════════════════════════
// WHY: GAS uses raw HTTP PATCH to PostgREST, but the
// service role key is NOT recognized as a JWT by PostgREST
// in newer Supabase projects (sb_publishable_ format).
// Result: PATCH returns 200 [] (RLS blocks, 0 rows updated).
//
// FIX: GAS calls this Edge Function instead. This function
// uses createClient() with the service role key — the SDK
// handles auth correctly and bypasses RLS.
//
// Deploy with: npx supabase functions deploy update-receipt-job --no-verify-jwt
// ═══════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

console.log("[update-receipt-job] module loaded")

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // ── Read job_id from URL query param ──
    const url = new URL(req.url)
    const job_id = url.searchParams.get("job_id")?.trim()

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id query parameter is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // ── GET = read job status (for debugging) ──
    if (req.method === "GET") {
      const { data: row, error: readErr } = await supabaseAdmin
        .from("receipt_jobs")
        .select("id, status, error, duration_ms, completed_at, result")
        .eq("id", job_id)
        .single()

      if (readErr) {
        return new Response(
          JSON.stringify({ error: readErr.message }),
          { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        )
      }

      return new Response(
        JSON.stringify(row),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // ── Read update data from body ──
    // NOTE: Body parsing is SAFE here because this is called from GAS
    // (server-to-server), NOT from the browser. The Supabase Edge
    // Functions body-parsing bug only affects browser POST requests.
    let data: Record<string, unknown>
    try {
      data = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    console.log(`[update-receipt-job] job_id=${job_id}, keys=${Object.keys(data).join(",")}`)

    // ── Update receipt_jobs via admin client (bypasses RLS) ──
    const { data: rows, error: updateErr } = await supabaseAdmin
      .from("receipt_jobs")
      .update(data)
      .eq("id", job_id)
      .select("id, status")

    if (updateErr) {
      console.error(`[update-receipt-job] DB error: ${updateErr.message}`)
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    const rowCount = rows?.length ?? 0
    console.log(`[update-receipt-job] OK: ${rowCount} row(s) updated, status=${rows?.[0]?.status}`)

    return new Response(
      JSON.stringify({ ok: true, job_id, rows_updated: rowCount }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )

  } catch (error) {
    console.error("[update-receipt-job] CRASH:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    )
  }
})
