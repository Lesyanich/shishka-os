// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-receipt
// Inbound webhook from Loyverse POS on closed receipts.
//
// Flow:
//   1. Read raw body bytes (HMAC verifies pre-parse).
//   2. Verify HMAC-SHA256 signature against LOYVERSE_WEBHOOK_SECRET.
//   3. Parse JSON. Loyverse may wrap as {type, receipt} or send receipt at top.
//   4. Call fn_ingest_loyverse_receipt(p_receipt) — idempotent on receipt_number,
//      chains fn_deduct_order_bom internally on first-insert path.
//   5. Return 200 {ok, order_id} on success.
//
// Failure semantics (matters for Loyverse retry behavior):
//   • Bad signature       → 401, log to loyverse_webhook_dead_letter
//   • Malformed JSON      → 200, log to loyverse_webhook_dead_letter (don't retry junk)
//   • RPC error           → 500, log to loyverse_sync_log (Loyverse retries)
//   • Already ingested    → 200 (RPC returns same UUID via idempotency)
//
// Deploy: `supabase functions deploy loyverse-receipt --no-verify-jwt`
// (no Supabase JWT on the request — auth is HMAC).
//
// Env: LOYVERSE_WEBHOOK_SECRET — set via `supabase secrets set`.
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"

const SECRET = Deno.env.get("LOYVERSE_WEBHOOK_SECRET") ?? ""

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, loyverse-signature",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

// HMAC-SHA256 → lowercase hex
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// Loyverse signature header may carry the hex digest plainly or prefixed
// (e.g. "sha256=abc..."). Strip a known prefix if present.
function normalizeSignature(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed.startsWith("sha256=")) return trimmed.slice("sha256=".length)
  return trimmed
}

async function logDeadLetter(args: {
  rawBody: string
  signature: string | null
  headers: Record<string, string>
  error: string
}) {
  try {
    await db.from("loyverse_webhook_dead_letter").insert({
      raw_body: args.rawBody,
      signature: args.signature,
      headers: args.headers,
      error: args.error,
    })
  } catch (e) {
    // Last-resort visibility — function logs are the only fallback if the DLQ
    // table is unreachable.
    console.error("loyverse-receipt: dead-letter insert failed:", e)
  }
}

async function logSyncError(error: string, payload: unknown) {
  try {
    await db.from("loyverse_sync_log").insert({
      action: "receipt_webhook",
      status: "error",
      error,
      payload,
    })
  } catch (e) {
    console.error("loyverse-receipt: sync-log insert failed:", e)
  }
}

Deno.serve(async (req) => {
  // CORS preflight (Loyverse won't send OPTIONS but Supabase routing may)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405)
  }

  // 1. Read raw body before parsing — HMAC signs the raw bytes
  const rawBody = await req.text()
  const headersObj = Object.fromEntries(req.headers)

  // 2. Verify signature. Header name TBD on first real Loyverse webhook;
  //    accept the two most likely variants.
  const sigHeader =
    req.headers.get("loyverse-signature") ??
    req.headers.get("x-loyverse-signature") ??
    null

  if (!SECRET) {
    await logSyncError("missing_webhook_secret", { headers: headersObj })
    return json({ ok: false, error: "server_missing_secret" }, 500)
  }

  if (!sigHeader) {
    await logDeadLetter({
      rawBody,
      signature: null,
      headers: headersObj,
      error: "missing_signature_header",
    })
    return json({ ok: false, error: "missing_signature" }, 401)
  }

  const expected = await hmacSha256Hex(SECRET, rawBody)
  const provided = normalizeSignature(sigHeader)
  if (!constantTimeEq(expected, provided)) {
    await logDeadLetter({
      rawBody,
      signature: sigHeader,
      headers: headersObj,
      error: "signature_mismatch",
    })
    return json({ ok: false, error: "invalid_signature" }, 401)
  }

  // 3. Parse. Loyverse delivery may wrap as {type, receipt} or send the receipt at top.
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch (e) {
    await logDeadLetter({
      rawBody,
      signature: sigHeader,
      headers: headersObj,
      error: `parse_error: ${(e as Error).message}`,
    })
    // 200 = don't make Loyverse retry malformed bodies
    return json({ ok: false, error: "parse_error" }, 200)
  }

  const receipt =
    (payload.receipt as Record<string, unknown> | undefined) ?? payload

  if (!receipt || typeof receipt !== "object" || !("receipt_number" in receipt)) {
    await logDeadLetter({
      rawBody,
      signature: sigHeader,
      headers: headersObj,
      error: "missing_receipt_number",
    })
    return json({ ok: false, error: "missing_receipt_number" }, 200)
  }

  // 4. Call ingest RPC. Idempotent on receipt_number; chains BOM deduction.
  const { data, error } = await db.rpc("fn_ingest_loyverse_receipt", {
    p_receipt: receipt,
  })

  if (error) {
    await logSyncError(error.message, receipt)
    // 500 → Loyverse will retry
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, order_id: data }, 200)
})
