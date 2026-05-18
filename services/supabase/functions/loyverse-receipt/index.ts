// ═══════════════════════════════════════════════════════════
// Edge Function: loyverse-receipt
// Inbound webhook from Loyverse POS on closed receipts.
//
// Auth model (per real-world Loyverse behavior observed 2026-05-18):
//   Loyverse does NOT sign webhook deliveries — no Loyverse-Signature header,
//   no documented HMAC scheme. Their threat model is "URL secrecy" + payload
//   contains `merchant_id` that the receiver can validate.
//
//   We implement defense-in-depth:
//     • If LOYVERSE_WEBHOOK_SECRET is set AND Loyverse-Signature header
//       arrives → HMAC-SHA256 verify (future-proofing if they add signing).
//     • Otherwise → require payload.merchant_id to match LOYVERSE_MERCHANT_ID.
//     • If neither check applies → reject with 401.
//
// Payload shape (confirmed from live delivery):
//   { merchant_id, type: "receipts.update", created_at,
//     receipts: [ { receipt_number, total_money, line_items: [...], ... } ] }
//   — `receipts` is ALWAYS an array, even with one element.
//
// Flow:
//   1. Read raw body, parse JSON, validate envelope.
//   2. Auth: HMAC if available, else merchant_id check.
//   3. Iterate payload.receipts[]; call fn_ingest_loyverse_receipt per receipt.
//      RPC is idempotent on receipt_number and chains BOM deduction internally.
//   4. Return 200 with array of order_ids, or 500 if any RPC failed
//      (Loyverse will retry the whole delivery).
//
// Failure semantics (matters for Loyverse retry behavior):
//   • Auth fail        → 401, log to loyverse_webhook_dead_letter
//   • Malformed JSON   → 200, log to DLQ (don't retry junk)
//   • Missing envelope → 200, log to DLQ
//   • Any RPC error    → 500, log to loyverse_sync_log (Loyverse retries)
//
// Deploy: `supabase functions deploy loyverse-receipt --no-verify-jwt`
//
// Env:
//   LOYVERSE_WEBHOOK_SECRET  — HMAC key (used only if Loyverse adds signing)
//   LOYVERSE_MERCHANT_ID     — expected merchant_id (always required)
// ═══════════════════════════════════════════════════════════

import { db } from "../_shared/supabase.ts"

const SECRET = Deno.env.get("LOYVERSE_WEBHOOK_SECRET") ?? ""
const EXPECTED_MERCHANT_ID = Deno.env.get("LOYVERSE_MERCHANT_ID") ?? ""

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

// HMAC-SHA256 → lowercase hex. Used only if Loyverse starts signing one day.
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405)
  }

  const rawBody = await req.text()
  const headersObj = Object.fromEntries(req.headers)
  const sigHeader =
    req.headers.get("loyverse-signature") ??
    req.headers.get("x-loyverse-signature") ??
    null

  // ── 1. Parse envelope ──
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
    return json({ ok: false, error: "parse_error" }, 200)
  }

  // ── 2. Authentication ──
  let authMethod: "hmac" | "merchant_id" | null = null

  if (sigHeader && SECRET) {
    // HMAC path (future-proof if Loyverse starts signing)
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
    authMethod = "hmac"
  } else if (EXPECTED_MERCHANT_ID) {
    // merchant_id path (current Loyverse reality — no signing)
    const payloadMerchant =
      typeof payload.merchant_id === "string" ? payload.merchant_id : null
    if (payloadMerchant !== EXPECTED_MERCHANT_ID) {
      await logDeadLetter({
        rawBody,
        signature: sigHeader,
        headers: headersObj,
        error: `merchant_id_mismatch: got ${payloadMerchant ?? "null"}`,
      })
      return json({ ok: false, error: "invalid_merchant" }, 401)
    }
    authMethod = "merchant_id"
  } else {
    // No auth configured at all — refuse
    await logDeadLetter({
      rawBody,
      signature: sigHeader,
      headers: headersObj,
      error: "server_no_auth_configured",
    })
    return json({ ok: false, error: "server_misconfigured" }, 500)
  }

  // ── 3. Extract receipts (always treat as array) ──
  // Loyverse: {merchant_id, type, created_at, receipts: [...]}
  // Fallback: {receipt: {...}} or single receipt at top level (smoke tests).
  let receipts: Array<Record<string, unknown>> = []
  if (Array.isArray(payload.receipts)) {
    receipts = payload.receipts as Array<Record<string, unknown>>
  } else if (
    payload.receipt && typeof payload.receipt === "object"
  ) {
    receipts = [payload.receipt as Record<string, unknown>]
  } else if ("receipt_number" in payload) {
    // Bare single-receipt (smoke test / direct CLI delivery)
    receipts = [payload]
  }

  if (receipts.length === 0) {
    await logDeadLetter({
      rawBody,
      signature: sigHeader,
      headers: headersObj,
      error: "no_receipts_in_payload",
    })
    return json({ ok: false, error: "no_receipts" }, 200)
  }

  // ── 4. Ingest each receipt ──
  const results: Array<{ receipt_number: string; order_id?: string; error?: string }> = []
  let anyError = false

  for (const receipt of receipts) {
    const rn = typeof receipt.receipt_number === "string" ? receipt.receipt_number : "<unknown>"
    if (!("receipt_number" in receipt)) {
      await logDeadLetter({
        rawBody,
        signature: sigHeader,
        headers: headersObj,
        error: "missing_receipt_number_in_element",
      })
      results.push({ receipt_number: rn, error: "missing_receipt_number" })
      continue
    }

    const { data, error } = await db.rpc("fn_ingest_loyverse_receipt", {
      p_receipt: receipt,
    })

    if (error) {
      await logSyncError(error.message, receipt)
      results.push({ receipt_number: rn, error: error.message })
      anyError = true
    } else {
      results.push({ receipt_number: rn, order_id: data as string })
    }
  }

  if (anyError) {
    return json({ ok: false, auth: authMethod, results }, 500)
  }

  return json({ ok: true, auth: authMethod, results }, 200)
})
